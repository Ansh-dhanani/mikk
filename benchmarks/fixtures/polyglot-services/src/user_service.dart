class UserService {
    String name;
    
    UserService(this.name);
    
    String getUser() => 'User: $name';
    
    int calculate(int x) => x * 2;
}

void main() {
    var service = UserService('test');
    print(service.getUser());
}