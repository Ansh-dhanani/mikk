#!/bin/bash

get_user() {
    local id=$1
    echo "Fetching user $id"
}

create_user() {
    local name=$1
    local email=$2
    echo "Creating user: $name ($email)"
}

delete_user() {
    local id=$1
    echo "Deleting user $id"
}

create_user "John" "john@example.com"
