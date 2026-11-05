#pragma once
#include <type_traits>
namespace std { template<typename T> struct __is_integer { enum { __value = std::is_integral<T>::value }; }; }
namespace std {
  template<typename, typename> struct __are_same { enum { __value = 0 }; typedef false_type __type; };
  template<typename T> struct __are_same<T, T> { enum { __value = 1 }; typedef true_type __type; };
  template<typename T> struct __is_floating { enum { __value = std::is_floating_point<T>::value }; };
  template<typename T> struct __is_char { enum { __value = 0 }; };
}
