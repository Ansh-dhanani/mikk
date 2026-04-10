(ns user-service.core
    (:require [clojure.string :as str]))

(defn display [name email]
    (str name " <" email ">"))

(defn create [params]
    {:name (:name params) :email (:email params)})

(def user (create {:name "Charlie" :email "charlie@example.com"}))
(println (display (:name user) (:email user)))