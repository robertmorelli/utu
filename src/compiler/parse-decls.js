// parse-decls.js — declaration walker registry

import { walkModuleDecl, walkUsingDecl } from './parse-decls-modules.js';
import { walkEnumDecl, walkProtoDecl, walkStructDecl } from './parse-decls-types.js';
import { walkFnDecl, walkFnName, walkOpDecl } from './parse-decls-functions.js';
import {
  walkBenchDecl, walkExportLibDecl, walkExportMainDecl, walkGlobalDecl,
  walkMeasure, walkTestDecl, walkTypeDecl,
} from './parse-decls-exports.js';
import {
  walkBlock, walkField, walkImplList, walkModuleParam, walkModuleParams,
  walkModuleTypeArgList, walkNomQualifier, walkParam, walkParamList,
  walkProtoGetSetter, walkProtoGetter, walkProtoMethod, walkProtoSetter,
  walkSelfParam, walkVariant,
} from './parse-decls-common.js';

export const walkers = {
  'module_decl':            walkModuleDecl,
  'op_decl':                walkOpDecl,
  'type_decl':              walkTypeDecl,
  'using_decl':             walkUsingDecl,
  'struct_decl':            walkStructDecl,
  'proto_decl':             walkProtoDecl,
  'enum_decl':              walkEnumDecl,
  'fn_decl':                walkFnDecl,
  'fn_name':                walkFnName,
  'global_decl':            walkGlobalDecl,
  'export_lib_decl':        walkExportLibDecl,
  'export_main_decl':       walkExportMainDecl,
  'test_decl':              walkTestDecl,
  'bench_decl':             walkBenchDecl,
  'measure_decl':           walkMeasure,
  'nom_qualifier':          walkNomQualifier,
  'field':                  walkField,
  'variant':                walkVariant,
  'param':                  walkParam,
  'self_param':             walkSelfParam,
  'proto_getter':           walkProtoGetter,
  'proto_setter':           walkProtoSetter,
  'proto_get_setter':       walkProtoGetSetter,
  'proto_method':           walkProtoMethod,
  'module_type_param_list': walkModuleParams,
  'module_type_param':      walkModuleParam,
  'module_type_arg_list':   walkModuleTypeArgList,
  'param_list':             walkParamList,
  'impl_list':              walkImplList,
  'block':                  walkBlock,
};
