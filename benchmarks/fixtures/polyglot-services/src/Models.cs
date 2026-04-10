namespace UserManagement
{
    public class User
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        
        public User(int id, string name, string email)
        {
            Id = id;
            Name = name;
            Email = email;
        }
    }
    
    public class UserService
    {
        private List<User> users = new List<User>();
        private int nextId = 1;
        
        public User CreateUser(string name, string email)
        {
            var user = new User(nextId++, name, email);
            users.Add(user);
            return user;
        }
        
        public User GetUser(int id)
        {
            return users.FirstOrDefault(u => u.Id == id);
        }
        
        public bool DeleteUser(int id)
        {
            var user = GetUser(id);
            if (user != null)
            {
                users.Remove(user);
                return true;
            }
            return false;
        }
    }
}
