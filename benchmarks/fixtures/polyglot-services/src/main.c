#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int id;
    char name[100];
    char email[100];
} User;

User* create_user(int id, const char* name, const char* email) {
    User* user = (User*)malloc(sizeof(User));
    user->id = id;
    strcpy(user->name, name);
    strcpy(user->email, email);
    return user;
}

void free_user(User* user) {
    free(user);
}

int main() {
    User* user = create_user(1, "John", "john@example.com");
    printf("User: %s\n", user->name);
    free_user(user);
    return 0;
}
