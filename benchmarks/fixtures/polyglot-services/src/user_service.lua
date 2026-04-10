local function display(name, email)
    return string.format("%s <%s>", name, email)
end

local function create(params)
    return { name = params.name, email = params.email }
end

local user = create({ name = "Ivan", email = "ivan@example.com" })
print(display(user.name, user.email))