package UserService;

use strict;
use warnings;

sub new {
    my ($class, $name, $email) = @_;
    return bless { name => $name, email => $email }, $class;
}

sub display {
    my ($self) = @_;
    return "$self->{name} <$self->{email}>";
}

sub create {
    my ($class, $params) = @_;
    return $class->new($params->{name}, $params->{email});
}

1;

my $user = UserService->new("Frank", "frank@example.com");
print $user->display() . "\n";