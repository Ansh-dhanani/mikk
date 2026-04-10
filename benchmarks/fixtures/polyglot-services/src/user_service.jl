struct User
    name::String
    email::String
end

function display(user::User)
    return "$(user.name) <$(user.email)>"
end

function create(params::Dict)
    return User(params[:name], params[:email])
end

user = create(Dict(:name => "Henry", :email => "henry@example.com"))
println(display(user))