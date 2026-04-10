class User
  attr_reader :name, :email
  
  def initialize(name, email)
    @name = name
    @email = email
  end
  
  def display
    "#{name} <#{email}>"
  end
  
  def self.create(params)
    new(params[:name], params[:email])
  end
end

user = User.new("Alice", "alice@example.com")
puts user.display