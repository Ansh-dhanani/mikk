defmodule UserService do
    defstruct name: "Alice", email: "alice@example.com"
    
    def display(user) do
        "#{user.name} <#{user.email}>"
    end
    
    def create(params) do
        struct(__MODULE__, params)
    end
end

user = %UserService{name: "Bob", email: "bob@example.com"}
IO.puts(UserService.display(user))