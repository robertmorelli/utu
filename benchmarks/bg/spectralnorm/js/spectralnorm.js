// BG spectralnorm Node #1 (Ian Osgood; Node.js by Isaac Gouy), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-node-1.html
// Changes: spectralnorm(n) -> bench(n), which returns the FNV-1a hash of the
// bytes the program printed ("%.9f\n"). Sequential in BG already.

function A(i,j) {
  return 1/((i+j)*(i+j+1)/2+i+1);
}

function Au(u,v) {
  for (var i=0; i<u.length; ++i) {
    var t = 0;
    for (var j=0; j<u.length; ++j)
      t += A(i,j) * u[j];
    v[i] = t;
  }
}

function Atu(u,v) {
  for (var i=0; i<u.length; ++i) {
    var t = 0;
    for (var j=0; j<u.length; ++j)
      t += A(j,i) * u[j];
    v[i] = t;
  }
}

function AtAu(u,v,w) {
  Au(u,w);
  Atu(w,v);
}

function spectralnorm(n) {
  var i, u=[], v=[], w=[], vv=0, vBv=0;
  for (i=0; i<n; ++i) {
    u[i] = 1; v[i] = w[i] = 0;
  }
  for (i=0; i<10; ++i) {
    AtAu(u,v,w);
    AtAu(v,u,w);
  }
  for (i=0; i<n; ++i) {
    vBv += u[i]*v[i];
    vv  += v[i]*v[i];
  }
  return Math.sqrt(vBv/vv);
}

function bench(n) {
  const s = spectralnorm(n).toFixed(9) + '\n';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
