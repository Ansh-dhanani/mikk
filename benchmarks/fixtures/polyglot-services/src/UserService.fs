module UserService

type User = { Name: string; Email: string }

let display (user: User) = 
    $"{user.Name} <{user.Email}>"

let create name email = 
    { Name = name; Email = email }

let user = create "Diana" "diana@example.com"
printfn "%s" (display user)