package com.example

class Service(val name: String) {
    def process(): String = s"Processing $name"
    
    def calculate(x: Int): Int = x * 2
}

object Main extends App {
    val service = Service("test")
    println(service.process())
}