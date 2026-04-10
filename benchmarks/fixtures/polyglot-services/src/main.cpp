#include <iostream>
#include <string>
#include <vector>

class User {
public:
    int id;
    std::string name;
    std::string email;
    
    User(int id, const std::string& name, const std::string& email)
        : id(id), name(name), email(email) {}
};

class UserService {
private:
    std::vector<User> users;
    int nextId = 1;
    
public:
    User createUser(const std::string& name, const std::string& email) {
        User user(nextId++, name, email);
        users.push_back(user);
        return user;
    }
    
    User* getUser(int id) {
        for (auto& user : users) {
            if (user.id == id) {
                return &user;
            }
        }
        return nullptr;
    }
    
    bool deleteUser(int id) {
        for (auto it = users.begin(); it != users.end(); ++it) {
            if (it->id == id) {
                users.erase(it);
                return true;
            }
        }
        return false;
    }
};

int main() {
    UserService service;
    User user = service.createUser("John", "john@example.com");
    std::cout << "Created user: " << user.name << std::endl;
    return 0;
}
