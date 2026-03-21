import Parser from "web-tree-sitter";
import binaryen from "binaryen";

await Parser.init();
const parser = new Parser();
const lang = await Parser.Language.load("path/to/your-grammar.wasm");
parser.setLanguage(lang);

async function compile(source, options = { wat: false, opt: true }) {

}


