/**
 * Tree-sitter queries for extracting code definitions across 13 languages.
 * Ported from GitNexus.
 *
 * NOTE: Some grammars (like Python and Ruby) use slightly different AST node
 * types for equivalent structures. These queries are written against
 * the standard tree-sitter grammars.
 */

export const TYPESCRIPT_QUERIES = `
(class_declaration name: (type_identifier) @name) @definition.class
(interface_declaration name: (type_identifier) @name) @definition.interface
(function_declaration name: (identifier) @name) @definition.function
(method_definition name: (property_identifier) @name) @definition.method
(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @definition.function
(lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression)))) @definition.function
(import_statement source: (string) @import.source) @import
(export_statement source: (string) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (member_expression property: (property_identifier) @call.name)) @call
(new_expression constructor: (identifier) @call.name) @call
(public_field_definition name: (property_identifier) @name) @definition.property
(public_field_definition name: (private_property_identifier) @name) @definition.property
(required_parameter (accessibility_modifier) pattern: (identifier) @name) @definition.property
(class_declaration name: (type_identifier) @heritage.class (class_heritage (extends_clause value: (identifier) @heritage.extends))) @heritage
(class_declaration name: (type_identifier) @heritage.class (class_heritage (implements_clause (type_identifier) @heritage.implements))) @heritage.impl
`;

export const JAVASCRIPT_QUERIES = `
(class_declaration name: (identifier) @name) @definition.class
(function_declaration name: (identifier) @name) @definition.function
(method_definition name: (property_identifier) @name) @definition.method
(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @definition.function
(lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression)))) @definition.function
(import_statement source: (string) @import.source) @import
(export_statement source: (string) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (member_expression property: (property_identifier) @call.name)) @call
(new_expression constructor: (identifier) @call.name) @call
(field_definition property: (property_identifier) @name) @definition.property
(class_declaration name: (identifier) @heritage.class (class_heritage (identifier) @heritage.extends)) @heritage
`;

export const PYTHON_QUERIES = `
(class_definition name: (identifier) @name) @definition.class
(function_definition name: (identifier) @name) @definition.function
(import_statement name: (dotted_name) @import.source) @import
(import_from_statement module_name: (dotted_name) @import.source) @import
(import_from_statement module_name: (relative_import) @import.source) @import
(call function: (identifier) @call.name) @call
(call function: (attribute attribute: (identifier) @call.name)) @call
(expression_statement (assignment left: (identifier) @name type: (type))) @definition.property
(class_definition name: (identifier) @heritage.class superclasses: (argument_list (identifier) @heritage.extends)) @heritage
`;

export const JAVA_QUERIES = `
(class_declaration name: (identifier) @name) @definition.class
(interface_declaration name: (identifier) @name) @definition.interface
(enum_declaration name: (identifier) @name) @definition.enum
(method_declaration name: (identifier) @name) @definition.method
(constructor_declaration name: (identifier) @name) @definition.constructor
(field_declaration declarator: (variable_declarator name: (identifier) @name)) @definition.property
(import_declaration (_) @import.source) @import
(method_invocation name: (identifier) @call.name) @call
(method_invocation object: (_) name: (identifier) @call.name) @call
(object_creation_expression type: (type_identifier) @call.name) @call
(class_declaration name: (identifier) @heritage.class (superclass (type_identifier) @heritage.extends)) @heritage
(class_declaration name: (identifier) @heritage.class (super_interfaces (type_list (type_identifier) @heritage.implements))) @heritage.impl
`;

export const C_QUERIES = `
(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(declaration declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(function_definition declarator: (pointer_declarator declarator: (function_declarator declarator: (identifier) @name))) @definition.function
(declaration declarator: (pointer_declarator declarator: (function_declarator declarator: (identifier) @name))) @definition.function
(struct_specifier name: (type_identifier) @name) @definition.struct
(union_specifier name: (type_identifier) @name) @definition.union
(enum_specifier name: (type_identifier) @name) @definition.enum
(type_definition declarator: (type_identifier) @name) @definition.typedef
(preproc_function_def name: (identifier) @name) @definition.macro
(preproc_def name: (identifier) @name) @definition.macro
(preproc_include path: (_) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (field_expression field: (field_identifier) @call.name)) @call
`;

export const GO_QUERIES = `
(function_declaration name: (identifier) @name) @definition.function
(method_declaration name: (field_identifier) @name) @definition.method
(type_declaration (type_spec name: (type_identifier) @name type: (struct_type))) @definition.struct
(type_declaration (type_spec name: (type_identifier) @name type: (interface_type))) @definition.interface
(import_declaration (import_spec path: (interpreted_string_literal) @import.source)) @import
(import_declaration (import_spec_list (import_spec path: (interpreted_string_literal) @import.source))) @import
(field_declaration_list (field_declaration name: (field_identifier) @name)) @definition.property
(call_expression function: (identifier) @call.name) @call
(call_expression function: (selector_expression field: (field_identifier) @call.name)) @call
(composite_literal type: (type_identifier) @call.name) @call
`;

export const CPP_QUERIES = `
(class_specifier name: (type_identifier) @name) @definition.class
(struct_specifier name: (type_identifier) @name) @definition.struct
(namespace_definition name: (namespace_identifier) @name) @definition.namespace
(enum_specifier name: (type_identifier) @name) @definition.enum
(type_definition declarator: (type_identifier) @name) @definition.typedef
(union_specifier name: (type_identifier) @name) @definition.union
(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(function_definition declarator: (function_declarator declarator: (qualified_identifier name: (identifier) @name))) @definition.method
(declaration declarator: (function_declarator declarator: (identifier) @name)) @definition.function
(field_declaration declarator: (field_identifier) @name) @definition.property
(field_declaration declarator: (function_declarator declarator: (identifier) @name)) @definition.method
(preproc_include path: (_) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (field_expression field: (field_identifier) @call.name)) @call
(call_expression function: (qualified_identifier name: (identifier) @call.name)) @call
(new_expression type: (type_identifier) @call.name) @call
`;

export const CSHARP_QUERIES = `
(class_declaration name: (identifier) @name) @definition.class
(interface_declaration name: (identifier) @name) @definition.interface
(struct_declaration name: (identifier) @name) @definition.struct
(enum_declaration name: (identifier) @name) @definition.enum
(record_declaration name: (identifier) @name) @definition.record
(namespace_declaration name: (identifier) @name) @definition.namespace
(namespace_declaration name: (qualified_name) @name) @definition.namespace
(file_scoped_namespace_declaration name: (identifier) @name) @definition.namespace
(method_declaration name: (identifier) @name) @definition.method
(local_function_statement name: (identifier) @name) @definition.function
(constructor_declaration name: (identifier) @name) @definition.constructor
(property_declaration name: (identifier) @name) @definition.property
(using_directive (qualified_name) @import.source) @import
(using_directive (identifier) @import.source) @import
(invocation_expression function: (identifier) @call.name) @call
(invocation_expression function: (member_access_expression name: (identifier) @call.name)) @call
(object_creation_expression type: (identifier) @call.name) @call
`;

export const RUST_QUERIES = `
(function_item name: (identifier) @name) @definition.function
(struct_item name: (type_identifier) @name) @definition.struct
(enum_item name: (type_identifier) @name) @definition.enum
(trait_item name: (type_identifier) @name) @definition.trait
(impl_item type: (type_identifier) @name !trait) @definition.impl
(mod_item name: (identifier) @name) @definition.module
(type_item name: (type_identifier) @name) @definition.type
(use_declaration argument: (_) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (field_expression field: (field_identifier) @call.name)) @call
(call_expression function: (scoped_identifier name: (identifier) @call.name)) @call
(struct_expression name: (type_identifier) @call.name) @call
(field_declaration_list (field_declaration name: (field_identifier) @name)) @definition.property
`;

export const PHP_QUERIES = `
(namespace_definition name: (namespace_name) @name) @definition.namespace
(class_declaration name: (name) @name) @definition.class
(interface_declaration name: (name) @name) @definition.interface
(trait_declaration name: (name) @name) @definition.trait
(enum_declaration name: (name) @name) @definition.enum
(function_definition name: (name) @name) @definition.function
(method_declaration name: (name) @name) @definition.method
(property_declaration (property_element (variable_name (name) @name))) @definition.property
(namespace_use_declaration (namespace_use_clause (qualified_name) @import.source)) @import
(function_call_expression function: (name) @call.name) @call
(member_call_expression name: (name) @call.name) @call
(nullsafe_member_call_expression name: (name) @call.name) @call
(object_creation_expression (name) @call.name) @call
`;

export const RUBY_QUERIES = `
(module name: (constant) @name) @definition.module
(class name: (constant) @name) @definition.class
(method name: (identifier) @name) @definition.method
(singleton_method name: (identifier) @name) @definition.method
(call method: (identifier) @call.name) @call
`;
