# syntax=docker/dockerfile:1

# Base image pinned by digest (Dependabot keeps it current). linux/amd64 only:
# the nargo/bb checksums below are for the x86_64 release builds.
ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

# --- toolchain: download nargo + bb release builds and verify checksums ---
FROM ${NODE_IMAGE} AS toolchain
ARG NARGO_VERSION=1.0.0-beta.22
ARG NARGO_SHA256=384c4fc800905b213e26aabd738a96a4a85b1a76ffc27fb19aeb6d33494a787b
ARG BB_VERSION=5.0.0-nightly.20260522
ARG BB_SHA256=d207ec90fbfa2fba24d7a47b7a75892ee052b7984252b866a4a0c1b5296e1571
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /toolchain
RUN curl -fsSL -o nargo.tar.gz \
      "https://github.com/noir-lang/noir/releases/download/v${NARGO_VERSION}/nargo-x86_64-unknown-linux-gnu.tar.gz" \
 && echo "${NARGO_SHA256}  nargo.tar.gz" | sha256sum -c - \
 && curl -fsSL -o bb.tar.gz \
      "https://github.com/AztecProtocol/barretenberg/releases/download/v${BB_VERSION}/barretenberg-amd64-linux.tar.gz" \
 && echo "${BB_SHA256}  bb.tar.gz" | sha256sum -c - \
 && tar xzf nargo.tar.gz \
 && tar xzf bb.tar.gz \
 && ./nargo --version | grep -q "nargo version = ${NARGO_VERSION}" \
 && ./bb --version | grep -qx "${BB_VERSION}"

# --- deps: production node_modules only, no install scripts ---
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- runtime ---
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    NARGO_BIN=/usr/local/bin/nargo \
    BB_BIN=/usr/local/bin/bb \
    PORT=4100
COPY --from=toolchain /toolchain/nargo /toolchain/bb /usr/local/bin/
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY circuits ./circuits

# Compile the circuit and fetch bb's CRS at build time, so the container
# needs no network access to prove. Only target/ (build output) and the CRS
# cache in the node user's home are writable; the app code is root-owned.
RUN mkdir -p circuits/payroll_compliance/target \
 && chown node:node circuits/payroll_compliance/target
USER node
RUN cd circuits/payroll_compliance \
 && nargo compile \
 && bb write_vk -b target/payroll_compliance.json -o /tmp/vk \
 && rm -rf /tmp/vk

EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# exec form, so SIGTERM reaches node directly and graceful shutdown runs.
CMD ["node", "src/server.js"]
