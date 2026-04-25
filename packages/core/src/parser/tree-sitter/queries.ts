export const TYPESCRIPT_QUERIES = `
(class_declaration name: (type_identifier) @name) @definition.class
(interface_declaration name: (type_identifier) @name) @definition.interface
(class_declaration name: (type_identifier) @heritage.class (class_heritage (extends_clause value: (identifier) @heritage.extends))) @heritage
(class_declaration name: (type_identifier) @heritage.class (class_heritage (implements_clause (type_identifier) @heritage.implements))) @heritage.impl
(function_declaration name: (identifier) @name) @definition.function
(method_definition name: (property_identifier) @name) @definition.method
(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @definition.function
(lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))) @definition.function
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression)))) @definition.function
(export_statement declaration: (class_declaration name: (type_identifier) @name)) @definition.class
(export_statement declaration: (function_declaration name: (identifier) @name)) @definition.function
(export_statement declaration: (abstract_class_declaration name: (type_identifier) @name)) @definition.class
(abstract_class_declaration name: (type_identifier) @name) @definition.class
(import_statement source: (string) @import.source) @import
(export_statement source: (string) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (member_expression property: (property_identifier) @call.name)) @call
(new_expression constructor: (identifier) @call.name) @call
(new_expression constructor: (member_expression property: (property_identifier) @call.name)) @call
(public_field_definition name: (property_identifier) @name) @definition.property
(public_field_definition name: (private_property_identifier) @name) @definition.property
(required_parameter (accessibility_modifier) pattern: (identifier) @name) @definition.property
(field_declaration name: (property_identifier) @name) @definition.property
`;

export const JAVASCRIPT_QUERIES = `
(class_declaration name: (identifier) @name) @definition.class
(class_declaration name: (identifier) @heritage.class (class_heritage (identifier) @heritage.extends)) @heritage
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
`;

export const PYTHON_QUERIES = `
(class_definition name: (identifier) @name) @definition.class
(class_definition name: (identifier) @heritage.class superclasses: (argument_list (identifier) @heritage.extends)) @heritage
(function_definition name: (identifier) @name) @definition.function
(decorated_definition
  (decorator) @decorator
  definition: (function_definition name: (identifier) @name)) @definition.function
(import_statement name: (dotted_name) @import.source) @import
(import_from_statement module_name: (dotted_name) @import.source) @import
(import_from_statement module_name: (relative_import) @import.source) @import
(call function: (identifier) @call.name) @call
(call function: (attribute attribute: (identifier) @call.name)) @call
(expression_statement (assignment left: (identifier) @name type: (type))) @definition.property
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

export const KOTLIN_QUERIES = `
; Top-level and member functions
(class_declaration (type_identifier) @name) @definition.class
(object_declaration (type_identifier) @name) @definition.class
(function_declaration (simple_identifier) @name) @definition.function
(class_body (function_declaration (simple_identifier) @name) @definition.method)
(property_declaration (variable_declaration (simple_identifier) @name)) @definition.property
(type_alias (type_identifier) @name) @definition.type
(import_header (identifier) @import.source) @import
(call_expression (simple_identifier) @call.name) @call
(call_expression
  (navigation_expression
    (navigation_suffix (simple_identifier) @call.name))) @call
(constructor_invocation
  (user_type (type_identifier) @call.name)) @call
`;

export const SWIFT_QUERIES = `
(class_declaration name: (type_identifier) @name) @definition.class
(protocol_declaration name: (type_identifier) @name) @definition.interface
(function_declaration name: (simple_identifier) @name) @definition.function
(property_declaration (pattern (simple_identifier) @name)) @definition.property
(import_declaration (identifier) @import.source) @import
(call_expression (simple_identifier) @call.name) @call
(call_expression
  (navigation_expression
    (navigation_suffix (simple_identifier) @call.name))) @call
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
(impl_item
  type: (type_identifier) @impl.type
  body: (declaration_list
    (function_item name: (identifier) @name) @definition.method))
(struct_item name: (type_identifier) @name) @definition.struct
(enum_item name: (type_identifier) @name) @definition.enum
(trait_item name: (type_identifier) @name) @definition.trait
(mod_item name: (identifier) @name) @definition.module
(type_item name: (type_identifier) @name) @definition.type
(use_declaration argument: (_) @import.source) @import
(call_expression function: (identifier) @call.name) @call
(call_expression function: (field_expression field: (field_identifier) @call.name)) @call
(call_expression function: (scoped_identifier name: (identifier) @call.name)) @call
(struct_expression name: (type_identifier) @call.name) @call
`;

export const PHP_QUERIES = `
(class_declaration name: (name) @name) @definition.class
(function_definition name: (name) @name) @definition.function
(method_declaration name: (name) @name) @definition.method
(interface_declaration name: (name) @name) @definition.interface
(trait_declaration name: (name) @name) @definition.trait
(enum_declaration name: (name) @name) @definition.enum
(namespace_definition name: (namespace_name) @name) @definition.namespace
(namespace_use_clause (name) @import.source) @import
(function_call_expression function: [(name) (qualified_name)] @call.name) @call
(member_call_expression name: (name) @call.name) @call
(nullsafe_member_call_expression name: (name) @call.name) @call
(object_creation_expression class: [(name) (qualified_name)] @call.name) @call
`;

export const RUBY_QUERIES = `
(module name: (constant) @name) @definition.module
(class name: (constant) @name) @definition.class
(singleton_class value: (class name: (constant) @name)) @definition.class
(method name: (identifier) @name) @definition.method
(singleton_method name: (identifier) @name) @definition.method
(call method: (identifier) @call.name) @call
(call method: (call method: (identifier) @call.name)) @call
`;

// Route detection queries - Express.js style (JS/TS)
export const EXPRESS_ROUTE_QUERIES = `
(call_expression 
  function: (member_expression 
    object: (call_expression 
      function: (identifier) @route.app)
    property: (property_identifier) @route.method)
  arguments: (argument_list 
    (string (string_content) @route.path)?)
) @route.def
(call_expression 
  function: (member_expression 
    object: (identifier) @route.app
    property: (property_identifier) @route.method)
  arguments: (argument_list 
    (string (string_content) @route.path)?)
) @route.def
`;

// Route detection queries - Flask/FastAPI style (Python)
export const FLASK_ROUTE_QUERIES = `
(decorated_definition 
  decorator: (call 
    function: (attribute 
      object: (identifier) @route.decorator)
    arguments: (argument_list (string (string_content) @route.path)))
  definition: (function_definition name: (identifier) @route.name))
) @route.def

(decorated_definition 
  decorator: (call 
    function: (identifier) @route.method
    arguments: (argument_list (string (string_content) @route.path)))
  definition: (function_definition name: (identifier) @route.name))
) @route.def
`;

// Route detection queries - Spring style (Java)
export const SPRING_ROUTE_QUERIES = `
(method_declaration 
  name: (identifier) @route.name
  (annotation (name (identifier) @route.anno))
) @route.def

(class_declaration 
  name: (identifier) @route.name
  (annotation (name (identifier) @route.anno))
) @route.def
`;

// Route detection queries - Gin style (Go)
export const GIN_ROUTE_QUERIES = `
(call_expression 
  function: (identifier) @route.method
  arguments: (argument_list (string (string_content) @route.path)))
) @route.def

(call_expression 
  function: (call_expression 
    function: (identifier) @route.method)
  arguments: (argument_list 
    (string (string_content) @route.path)?)
) @route.def

(call_expression 
  function: (selector_expression 
    field: (identifier) @route.method
    object: (call_expression function: (identifier)))
  arguments: (argument_list (string (string_content) @route.path)))
) @route.def
`;

// Route detection queries - Laravel style (PHP)
export const LARAVEL_ROUTE_QUERIES = `
(call_expression 
  function: (call_expression 
    function: (identifier) @route.method)
  arguments: (argument_list (string (string_content) @route.path)))
) @route.def

(call_expression 
  function: (identifier) @route.method
  arguments: (argument_list (string (string_content) @route.path)))
) @route.def
`;

// Route detection queries - Rails style (Ruby)
export const RAILS_ROUTE_QUERIES = `
(call 
  method: (identifier) @route.method
  arguments: (argument_list (string (string_content) @route.path)))
) @route.def
`;

// Scala queries - uses class_definition and function_definition
export const SCALA_QUERIES = `
(class_definition (identifier) @name) @definition.class
(object_definition (identifier) @name) @definition.class
(function_definition (identifier) @name) @definition.function
(function_definition (identifier) @call.name) @call
`;

export const DART_QUERIES = `
(class_definition name: (type_identifier) @name) @definition.class
(method_declaration name: (identifier) @name) @definition.method
(function_declaration name: (identifier) @name) @definition.function
(constructor_declaration name: (identifier) @name) @definition.constructor
(import_directive source: (string_literal) @import.source) @import
(method_invocation name: (identifier) @call.name) @call
(function_invocation name: (identifier) @call.name) @call
`;

// Zig queries - uses function_declaration
export const ZIG_QUERIES = `
(function_declaration (identifier) @name) @definition.function
(variable_declaration (identifier) @name) @definition.const
`;

// Elixir queries — def/defp/defmacro only, not all calls
export const ELIXIR_QUERIES = `
(call
  target: (identifier) @_def
  (#match? @_def "^(def|defp|defmacro|defmacrop)$")
  (arguments (identifier) @name)) @definition.function
(call
  target: (identifier) @_def
  (#match? @_def "^(def|defp|defmacro|defmacrop)$")
  (arguments (call target: (identifier) @name))) @definition.function
(call target: (dot field: (identifier) @call.name)) @call
(call
  target: (identifier) @call.name
  (#not-match? @call.name "^(def|defp|defmodule|defmacro|defmacrop|use|import|require|alias)$")) @call
(binary_remote_call
  left: (_)
  right: (identifier) @call.name) @call
`;

// OCaml queries - uses value_definition and value_name
export const OCAML_QUERIES = `
(value_definition (let_binding (value_name) @name)) @definition.function
`;

// Lua queries - uses function_definition_statement
export const LUA_QUERIES = `
(function_definition_statement (identifier) @name) @definition.function
(variable_assignment (variable_list (identifier) @name)) @definition.var
(local_variable_declaration (variable_list (identifier) @name)) @definition.local
`;

// Bash/Shell queries
export const BASH_QUERIES = `
(function_definition name: (word) @name) @definition.function
`;

// CSS queries
export const CSS_QUERIES = `
(tag_name) @definition.tag
(class_name) @definition.class
(id_name) @definition.id
(property_name) @definition.property
(at_keyword) @definition.at-rule
`;

// JSON queries (simple key-value)
export const JSON_QUERIES = `
(string) @definition.key
(number) @definition.value
(true) @definition.value
(false) @definition.value
(null) @definition.value
`;
