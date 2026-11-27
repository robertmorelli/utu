import fs from 'node:fs/promises';
import {createWutuRuntime,installWutuStorage,wutuStyle} from '../src/runtime/wutu.js';
export async function syncWutuRuntime() {
 const source=`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
mod Component {
    proto &:
        | render() Externref
}

mod wutu {
    fn init() Void {
        let install: fun() Void = @es/\\ () => { globalThis.__utuWutu ??= (${createWutuRuntime.toString()})(); } \\/;
        install();
    }
    fn page(root: Externref) Void {
        // The page's <html>: in place of the document's, with the styles Wutu
        // has put in the old head (a prerendered page adopts its own: no swap).
        let attach: fun(Externref) Void = @es/\\ root=>{if(root===document.documentElement)return;const head=root.querySelector(':scope>head')??root.insertBefore(document.createElement('head'),root.firstChild);for(const s of document.head.querySelectorAll('style,[data-wutu-style]'))head.append(s);document.replaceChild(root,document.documentElement)} \\/;
        attach(root);
    }
    fn storage_init() Void {
        init();
        let install: fun() Void = @es/\\ () => { (${installWutuStorage.toString()})(globalThis.__utuWutu); } \\/;
        install();
    }
    fn stored_load(key: Str) Str {
        let load: fun(Str) Str = @es/\\ key=>{try{return localStorage.getItem(key)??'';}catch(e){globalThis.__utuWutu.storageError=String(e.message??e);return '';}} \\/;
        return load(key);
    }
    fn stored_register(key: Str, encode: cl() Str, manual: Bool, apply: cl(Str) Void) Void {
        let register: fun(Str,cl() Str,Bool,cl(Str) Void) Void = @es/\\ (key,encode,manual,apply)=>globalThis.__utuWutu.store(key,encode,!!manual,apply) \\/;
        register(key,encode,manual,apply);
    }
    /// A shared stylesheet (\`@style\`, \`@document\`), installed once.
    fn style(sheet: Str) Void {
        init();
        let install: fun(Str) Void = @es/\\ (${wutuStyle.toString()}) \\/;
        install(sheet);
    }
    fn invalidate(name: Str) Void {
        let call: fun(Str) Void = @es/\\ (name)=>globalThis.__utuWutu?.invalidate(name) \\/;
        call(name);
    }
    fn save(key: Str) Void {
        let call: fun(Str) Void = @es/\\ (key)=>globalThis.__utuWutu?.save?.(key) \\/;
        call(key);
    }
    fn flush() Void {
        let call: fun() Void = @es/\\ ()=>globalThis.__utuWutu?.flush?.() \\/;
        call();
    }
    fn focus(id: Str) Void {
        let call: fun(Str) Void = @es/\\ (id)=>globalThis.__utuWutu?.focus(id) \\/;
        call(id);
    }
    fn after_render(callback: cl() Void) Void {
        let call: fun(cl() Void) Void = @es/\\ (callback)=>globalThis.__utuWutu?.after(callback) \\/;
        call(callback);
    }
    fn on_cleanup(callback: cl() Void) Void {
        let call: fun(cl() Void) Void = @es/\\ (callback)=>globalThis.__utuWutu?.cleanup(callback) \\/;
        call(callback);
    }
    /// A template's text hole (\`= x;\`): a number or a Bool shows as its
    /// \`str()\`, a Str or a node as itself. The compiler picks which, by
    /// x's type; this body is never what runs.
    fn show_list(values: Array[$T]) Externref {
        let make: fun() Externref = @es/\\ ()=>[] \\/;
        let push: fun(Externref, Externref) Void = @es/\\ (a,v)=>{a.push(v)} \\/;
        let begin_item: fun(I32) Void = @es/\\ i=>globalThis.__utuWutu.pushCall('list:'+i) \\/;
        let end_item: fun() Void = @es/\\ ()=>globalThis.__utuWutu.popKey() \\/;
        let result = make();
        for (values, 0 ..< values.len()) |value, index| {
            begin_item(index);
            push(result, wutu.show(value));
            end_item();
        }
        return result;
    }
    fn show(value: Externref) Externref {
        return value;
    }
    /// A keyed loop's key (\`key k\`) as text: a Str is itself, a number or
    /// a Bool its \`str()\`. The compiler picks which; this body is never
    /// what runs.
    fn key_text(value: Externref) Str {
        return "";
    }
    /// A text hole's reuse key (\`= f(a, b);\`): the compiler makes it, from
    /// the call and its arguments; this body is never what runs.
    fn memo_key(call: Externref, key: Str) Str {
        return key;
    }
    fn route() Str {
        let call: fun() Str = @es/\\ ()=>location.hash.slice(1)||"/" \\/;
        return call();
    }
    fn number(value: I32) Str {
        let format: fun(I32) Str = @es/\\ value=>String(value) \\/;
        return format(value);
    }
    fn money(cents: I32) Str {
        let format: fun(I32) Str = @es/\\ cents=>(cents<0?"-$":"$")+(Math.abs(cents)/100).toFixed(2) \\/;
        return format(cents);
    }
    fn decimal(value: F64, digits: I32) Str {
        let format: fun(F64,I32) Str = @es/\\ (value,digits)=>value.toFixed(Math.max(0,Math.min(20,digits))) \\/;
        return format(value,digits);
    }
    fn reload_store(key: Str) Void {
        let reload: fun(Str) Void = @es/\\ key=>globalThis.__utuWutu?.reload?.(key) \\/;
        reload(key);
    }
    fn interval(key: Str, milliseconds: F64, callback: cl() Void) Void {
        let start: fun(Str, F64, cl() Void) Void = @es/\\ (key,ms,callback)=>globalThis.__utuWutu?.interval(key,ms,callback) \\/;
        start(key,milliseconds,callback);
    }
    fn storage_error() Str {
        let read: fun() Str = @es/\\ () => globalThis.__utuWutu?.storageError ?? "" \\/;
        return read();
    }
    fn refresh() Void {
        let update: fun() Void = @es/\\ () => globalThis.__utuWutu?.refresh() \\/;
        update();
    }
}
`;
 await fs.writeFile(new URL('../std/wutu.utu',import.meta.url),source);
}
