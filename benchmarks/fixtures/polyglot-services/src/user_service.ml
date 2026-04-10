module UserService = struct
    type user = { name: string; email: string }
    
    let create name email = { name; email }
    
    let display u = Printf.sprintf "%s <%s>" u.name u.email
end

let user = UserService.create "Eve" "eve@example.com" in
print_endline (UserService.display user)