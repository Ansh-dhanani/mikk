display <- function(name, email) {
    paste0(name, " <", email, ">")
}

create <- function(params) {
    list(name = params$name, email = params$email)
}

user <- create(list(name = "Grace", email = "grace@example.com"))
cat(display(user$name, user$email), "\n")