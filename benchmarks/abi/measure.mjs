import { sum } from './arrays.mjs';

// Shared unchanged by Node, Bun, and Chromium benchmark hosts.
export function measureArrays(methods) {
  let checksum = 0;
  const rows = [];
  for (const length of [32, 4096, 65536]) {
    const values = Array.from({length}, (_,i)=>(i%17)-8);
    const expected = sum(values), rounds = Math.max(4, Math.ceil(262144 / length));
    const samples = Object.fromEntries(Object.keys(methods).map(n=>[n,[]]));
    for (let warm = 0; warm < 10; warm++) for (const fn of Object.values(methods)) for (let r=0;r<rounds;r++) checksum += fn(values);
    // Rotate order to reduce thermal/JIT/order bias. No cross-engine absolute threshold.
    for (let sample=0;sample<15;sample++) {
      const names = Object.keys(methods);
      for (let j=0;j<names.length;j++) {
        const name = names[(sample+j)%names.length], fn=methods[name];
        if (fn(values) !== expected) throw new Error(`Incorrect result for ${name}`);
        const start = performance.now();
        for(let r=0;r<rounds;r++) checksum += fn(values);
        samples[name].push((performance.now()-start)*1e6/(length*rounds));
      }
    }
    const timings = Object.fromEntries(Object.entries(samples).map(([name,values])=>{
      values.sort((a,b)=>a-b);return [name,{ medianNsPerElement: values[7], p10:values[1], p90:values[13] }];
    }));
    for(const value of Object.values(timings)) value.relativeToJS= value.medianNsPerElement/timings.javascript.medianNsPerElement;
    rows.push({ length, rounds, timings });
  }
  return { checksum, rows };
}
