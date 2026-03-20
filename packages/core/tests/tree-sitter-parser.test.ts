import { describe, expect, test } from 'bun:test'
import { TreeSitterParser } from '../src/parser/tree-sitter/parser.js'
import { resolve } from 'node:path'

describe('TreeSitterParser', () => {
    test('parses Python correctly', async () => {
        const parser = new TreeSitterParser()
        const pyContent = `
import os
from sys import argv

class User:
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        return self.name

def main():
    u = User("Alice")
    print(u.get_name())
`
        const result = await parser.parse('test.py', pyContent)
        
        expect(result.classes.length).toBe(1)
        expect(result.classes[0].name).toBe('User')
        
        expect(result.functions.length).toBe(3) // __init__, get_name, main
        const mainFn = result.functions.find((f: any) => f.name === 'main')
        expect(mainFn).toBeDefined()
        
        expect(result.imports.length).toBe(2)
        expect(result.imports.map((i: any) => i.source)).toContain('os')
        expect(result.imports.map((i: any) => i.source)).toContain('sys')
        
        expect(result.functions[0].calls).toContain('User')
        expect(result.functions[0].calls).toContain('print')
        expect(result.functions[0].calls).toContain('get_name')
    })

    test('parses Java correctly', async () => {
        const parser = new TreeSitterParser()
        const javaContent = `
import java.util.List;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello");
    }

    private int calculate(int a, int b) {
        return a + b;
    }
}
`
        const result = await parser.parse('App.java', javaContent)
        
        expect(result.classes.length).toBe(1)
        expect(result.classes[0].name).toBe('App')
        
        expect(result.functions.length).toBe(2) // main, calculate
        
        expect(result.imports.length).toBe(1)
        expect(result.imports[0].source).toBe('java.util.List')
    })
    
    test('parses Go correctly', async () => {
        const parser = new TreeSitterParser()
        const goContent = `
package main

import (
    "fmt"
    "net/http"
)

type Server struct {
    port int
}

func (s *Server) Start() {
    fmt.Println("Starting")
}

func main() {
    s := Server{port: 8080}
    s.Start()
}
`
        const result = await parser.parse('main.go', goContent)
        
        expect(result.classes.length).toBe(1)
        // struct maps to class in our universal AST
        expect(result.classes[0].name).toBe('Server')
        
        expect(result.functions.length).toBe(2) // Start, main
        
        expect(result.imports.length).toBe(2)
        expect(result.imports.map((i: any) => i.source)).toContain('fmt')
    })
    
    // EDGE CASES & ERROR HANDLING
    
    test('handles empty files gracefully', async () => {
        const parser = new TreeSitterParser()
        const result = await parser.parse('empty.py', '')
        
        expect(result.functions.length).toBe(0)
        expect(result.classes.length).toBe(0)
        expect(result.imports.length).toBe(0)
        expect(result.path).toBe('empty.py')
        expect(result.language).toBe('python')
    })

    test('handles syntax errors in Python code gracefully', async () => {
        const parser = new TreeSitterParser()
        const badPyContent = `
def good_function():
    print("This is fine")

def bad_function(
    print("Missing closing paren and colon"
    
class GoodClass:
    pass
`
        // Tree-sitter is fault-tolerant, so it should not crash.
        const result = await parser.parse('malformed.py', badPyContent)
        
        // We assert that it successfully returns a ParsedFile object without throwing any errors
        expect(result.path).toBe('malformed.py')
        expect(result.language).toBe('python')
        expect(Array.isArray(result.functions)).toBe(true)
        expect(Array.isArray(result.classes)).toBe(true)
    })
    
    test('handles unsupported extensions gracefully', async () => {
        const parser = new TreeSitterParser()
        const result = await parser.parse('unknown.xyz', 'some weird content')
        
        // Should return a fallback ParsedFile without crashing
        expect(result.functions.length).toBe(0)
        expect(result.classes.length).toBe(0)
        // TreeSitter fallback is 'unknown' for unsupported extensions
        expect(result.language).toBe('unknown')
    })
    
    test('handles syntax errors in Java gracefully', async () => {
        const parser = new TreeSitterParser()
        const badJavaContent = `
public class Main {
    public void goodMethod() {
        int x = 5;
    }
    
    public void badMethod( { // Syntax error here
        System.out.println("Hello"
    }
}
`
        // Ensure no crash on parse
        const result = await parser.parse('Main.java', badJavaContent)
        
        expect(result.path).toBe('Main.java')
        expect(result.language).toBe('java')
        expect(Array.isArray(result.classes)).toBe(true)
    })
})
