module Main where

data User = User { name :: String, email :: String }

display :: User -> String
display (User n e) = n ++ " <" ++ e ++ ">"

main :: IO ()
main = do
    let user = User "Alice" "alice@example.com"
    putStrLn (display user)