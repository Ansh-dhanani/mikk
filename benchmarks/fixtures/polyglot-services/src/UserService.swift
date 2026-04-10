import Foundation

class UserService {
    func getUser(id: String) -> User? {
        return users[id]
    }
    
    func createUser(name: String, email: String) -> User {
        let user = User(id: UUID().uuidString, name: name, email: email)
        users[user.id] = user
        return user
    }
    
    func deleteUser(id: String) -> Bool {
        return users.removeValue(forKey: id) != nil
    }
}

struct User {
    let id: String
    let name: String
    let email: String
}
