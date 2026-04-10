package com.example

class Calculator {
    fun add(a: Int, b: Int): Int = a + b
    
    fun multiply(a: Int, b: Int): Int = a * b
    
    suspend fun calculateAsync(value: Int): Int = value * 2
    
    val constant: Int = 42
}

fun main() {
    val calc = Calculator()
    println(calc.add(5, 3))
}