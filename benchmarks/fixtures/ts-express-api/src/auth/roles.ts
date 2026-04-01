export enum Role {
    USER = 'USER',
    ADMIN = 'ADMIN',
    SUPER_ADMIN = 'SUPER_ADMIN'
}

export function hasPermission(userRole: string, requiredRole: string): boolean {
    if (userRole === Role.SUPER_ADMIN) return true;
    if (requiredRole === Role.USER && (userRole === Role.ADMIN || userRole === Role.USER)) return true;
    if (requiredRole === Role.ADMIN && userRole === Role.ADMIN) return true;
    return false;
}
