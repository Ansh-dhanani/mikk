<?php

class User {
    public $id;
    public $name;
    public $email;
    
    public function __construct($id, $name, $email) {
        $this->id = $id;
        $this->name = $name;
        $this->email = $email;
    }
}

class UserService {
    public function getUser($id) {
        return null;
    }
    
    public function createUser($name, $email) {
        return new User(1, $name, $email);
    }
}