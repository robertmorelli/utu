(fn_decl (block) @function.inside) @function.around
(op_decl (block) @function.inside) @function.around
(closure_expr (block) @function.inside) @function.around
(struct_decl) @class.around
(enum_decl) @class.around
(proto_decl) @class.around
(module_decl) @class.around
(param) @parameter.inside
(closure_param) @parameter.inside
(comment) @comment.inside
(comment)+ @comment.around
(test_decl (block) @test.inside) @test.around
