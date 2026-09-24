export const sum = (...values) => values.reduce((a,b)=>a+b,0);
export const optional = (value,factor=2) => value*factor;
export const overloaded = value => typeof value === 'string' ? value.toUpperCase() : value+1;
export const flip = value => { if(typeof value!=='boolean')throw Error('boolean ABI');return !value; };
export const apply = (value,callback) => callback(value);
export const echo = value => value;
export const union = value => value;
export const make = options => options;
export const later = value => Promise.resolve(value);
export const fail = () => { throw Error('fixture failure'); };
export class Counter {
  constructor(start=0){this.value=start;this.id='counter';this.label='hello';}
  get doubled(){return this.value*2;}
  increment(amount){this.value+=amount;return this.value;}
}
export const constants={name:'fixture',times:value=>value*3,nested:{answer:42}};
export const token=Symbol('token');
export const symbolic=()=>({[token]:()=> 'symbol works',*[Symbol.iterator](){yield 1;yield 2;}});
export default name=>`Hello ${name}`;
export const arbitrary = callback => callback.call({label:'receiver',count:42}, 1, 'two', true);
export const booleanCallback = callback => { const value=callback(false); if(typeof value!=='boolean') throw Error('callback boolean ABI'); return value; };
export const identity = value => value;
export const Util = {label:'namespace',scale:n=>n*2,Nested:{answer:42}};

export const dictionary = { answer: 42 };
