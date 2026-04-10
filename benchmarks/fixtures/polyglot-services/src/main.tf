variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

locals {
  name_prefix = "user-service"
  tags = {
    Name        = "${local.name_prefix}-instance"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

resource "aws_instance" "app" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.instance_type
  tags          = local.tags

  user_data = <<-EOF
              #!/bin/bash
              echo "User service initialized"
              EOF
}

resource "aws_security_group" "app" {
  name        = "${local.name_prefix}-sg"
  description = "Security group for user service"
  tags        = local.tags

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}