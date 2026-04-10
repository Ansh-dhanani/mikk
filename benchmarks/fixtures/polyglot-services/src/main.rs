use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub email: String,
}

pub struct UserService {
    users: HashMap<u32, User>,
    next_id: u32,
}

impl UserService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
            next_id: 1,
        }
    }
    
    pub fn create_user(&mut self, name: String, email: String) -> User {
        let user = User {
            id: self.next_id,
            name,
            email,
        };
        self.users.insert(user.id, user.clone());
        self.next_id += 1;
        user
    }
    
    pub fn get_user(&self, id: u32) -> Option<&User> {
        self.users.get(&id)
    }
    
    pub fn delete_user(&mut self, id: u32) -> bool {
        self.users.remove(&id).is_some()
    }
}

fn main() {
    let mut service = UserService::new();
    let user = service.create_user("John".to_string(), "john@example.com".to_string());
    println!("Created user: {}", user.name);
}
