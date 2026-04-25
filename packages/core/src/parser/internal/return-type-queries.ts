/**
 * Return Type Queries for All Languages
 * Captures function/method return types using Tree-sitter
 */

export interface ReturnTypeQuery {
  language: string
  // Tree-sitter query to match function definition and capture return type
  query: string
  // Capture group index for return type
  returnCapture: number
  // Function name capture group (optional)
  nameCapture?: number
}

// All languages with their return type patterns
export const RETURN_TYPE_QUERIES: ReturnTypeQuery[] = [
  // Python: def foo() -> str:
  {
    language: 'python',
    query: `
      (function_def
        name: (identifier) @name
        (type_annotation)? @return
        (parameters)? @params)
      (async_function_def
        name: (identifier) @name
        (type_annotation)? @return
        (parameters)? @params)
    `,
    returnCapture: 2, // the type_annotation node
    nameCapture: 1,
  },
  // JavaScript/TypeScript: function foo(): string {}
  {
    language: 'javascript',
    query: `
      (function
        name: (identifier) @name
        return: (type_annotation) @return
        parameters: (formal_parameters) @params)
      (method_definition
        name: (property_identifier) @name
        return: (type_annotation) @return
        parameters: (formal_parameters) @params)
      (arrow_function
        name: (identifier)? @name
        return: (type_annotation) @return
        parameters: (formal_parameters) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Go: func foo() string {}
  {
    language: 'go',
    query: `
      (function_declaration
        name: (identifier) @name
        (type (identifier) @return)
        (parameter_list) @params)
      (method_declaration
        name: (field_identifier) @name
        (type (identifier) @return)
        (parameter_list) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Rust: fn foo() -> String {}
  {
    language: 'rust',
    query: `
      (function_item
        name: (identifier) @name
        (type (builtin_type) @return)
        (parameters) @params)
      (method_declaration
        name: (field_identifier) @name
        (type (builtin_type) @return
        (parameters) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Java: public String foo() {}
  {
    language: 'java',
    query: `
      (method_declaration
        type: (class_type) @return
        name: (identifier) @name
        parameters: (formal_parameters) @params)
      (method_invocation
        type: (class_type) @return
        name: (identifier) @name)
    `,
    returnCapture: 1,
    nameCapture: 2,
  },
  // Kotlin: fun foo(): String {}
  {
    language: 'kotlin',
    query: `
      (function_declaration
        name: (identifier) @name
        type: (user_type) @return
        parameters: (parameters) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // C/C++: int foo() {}
  {
    language: 'c',
    query: `
      (function_definition
        type: (primitive_type) @return
        declarator: (identifier) @name
        parameters: (parameter_list) @params)
      (declaration
        type: (primitive_type) @return
        declarator: (identifier) @name)
    `,
    returnCapture: 1,
    nameCapture: 2,
  },
  // C#: public string Foo() {}
  {
    language: 'csharp',
    query: `
      (method_declaration
        type: (predefined_type) @return
        name: (identifier) @name
        parameter_list: (parameter_list) @params)
    `,
    returnCapture: 1,
    nameCapture: 2,
  },
  // Ruby: def foo; end (no type, always dynamic)
  {
    language: 'ruby',
    query: `
      (method)
    `,
    returnCapture: 0,
  },
  // PHP: function foo(): ?string {}
  {
    language: 'php',
    query: `
      (function_definition
        name: (identifier) @name
        return_type: ( nullable_type (identifier) @return)
        (formal_parameters) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Swift: func foo() -> String {}
  {
    language: 'swift',
    query: `
      (function_declaration
        name: (identifier) @name
        (optional: (type (simple_type) @return))?
        parameters: (parameters) @params)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Scala: def foo: String = {}
  {
    language: 'scala',
    query: `
      (definition
        name: (identifier) @name
        (type_identifier) @return)
    `,
    returnCapture: 2,
    nameCapture: 1,
  },
  // Dart: String foo() {}
  {
    language: 'dart',
    query: `
      (method_declaration
        type: (named_type) @return
        name: (identifier) @name
        parameters: (formal_parameters) @params)
    `,
    returnCapture: 1,
    nameCapture: 2,
  },
  // Elixir: @spec foo() :: String
  {
    language: 'elixir',
    query: `
      (spec
        (optional (type (identifier) @return)))
    `,
    returnCapture: 0,
  },
]

export function getReturnTypeQuery(language: string): ReturnTypeQuery | undefined {
  return RETURN_TYPE_QUERIES.find(q => q.language === language.toLowerCase())
}

export function extractReturnTypeFromCapture(returnNode: any, language: string): string {
  if (!returnNode) return 'unknown'
  
  // Different parsers use different node structures
  const text = returnNode?.text || returnNode?.name || returnNode?.value || ''
  
  // Clean up the return type
  return text
    .replace(/null|void|nil|undefined|Nothing|None/gi, 'void')
    .replace(/\?/g, '')
    .trim() || 'unknown'
}

export const SUPPORTED_LANGUAGES = RETURN_TYPE_QUERIES.map(q => q.language)