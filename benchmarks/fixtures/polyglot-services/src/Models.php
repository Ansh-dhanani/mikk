<?php

class User {
    public $id;
    public $
ame;
    public $email;
    
    public function __construct($id, $
ame, $email) {
        $	his->id = $id;
        $	his->name = $
ame;
        $	his->email = $email;
    }
}

class UserService {
    public function getUser($id) {
        return null;
    }
    
    public function createUser($
ame, $email) {
        return new User(1, $
ame, $email);
    }
}
