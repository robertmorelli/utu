; Wutu highlights for Helix (the payload of `@wutu/\ … \/`).

(comment) @comment
(string) @string
(template_string) @string

; Directives
["@reactive" "@island" "@style" "@document" "@unmanaged"] @keyword.directive

; Elements
(tag (name) @tag)
(class_name) @attribute
(id_name) @attribute
(alias) @variable
"as" @keyword

; Attributes, properties, bindings, events
(attribute_name) @attribute
(attribute_name (name) @attribute)
(property_name) @variable.other.member
(binding_name) @keyword.special
(event_name) @function
["on" "quiet"] @keyword

; Control
["if" "else" "for" "key" "global"] @keyword.control
(capture (name) @variable.parameter)

; CSS
(css_property) @variable.other.member
(css_property (name) @variable.other.member)
(css_keyword) @constant
(css_number) @constant.numeric
(css_color) @constant.builtin
(css_url) @string.special.url
(css_function_name) @function.builtin
(css_selector) @tag
"!important" @keyword

; Utu inside the template, as in utu files
(identifier) @variable
(keyword) @keyword
((keyword) @constant.builtin.boolean (#match? @constant.builtin.boolean "^(true|false)$"))
((keyword) @constant.builtin (#eq? @constant.builtin "null"))
((keyword) @keyword.control (#match? @keyword.control "^(if|else|match|alt|promote|orelse|return|await|try|catch|for|while|loop|break|continue|defer|yield|fatal|assert)$"))
((keyword) @keyword.operator (#match? @keyword.operator "^(not|and|or|xor)$"))
((identifier) @type (#match? @type "^[A-Z]"))
((identifier) @function . (paren_group))
(number) @constant.numeric
(operator) @operator

; A DSL inside that utu: `@name/\ … \/`
(dsl_expr "@" @function.macro)
(dsl_name) @function.macro

["{" "}" "(" ")" "[" "]"] @punctuation.bracket
[";" "," ":" "." "|"] @punctuation.delimiter
"=" @operator
