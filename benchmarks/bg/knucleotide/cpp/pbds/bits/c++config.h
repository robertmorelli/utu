// Shim: the libstdc++ configuration macros pb_ds and its ext/ helpers use, for libc++.
#pragma once
#include <cstddef>
#include <cassert>
#define _GLIBCXX_BEGIN_NAMESPACE_VERSION
#define _GLIBCXX_END_NAMESPACE_VERSION
#define _GLIBCXX_VISIBILITY(x)
#define _GLIBCXX_BEGIN_NAMESPACE_CONTAINER
#define _GLIBCXX_END_NAMESPACE_CONTAINER
#define _GLIBCXX_STD_C std
#define _GLIBCXX_NOEXCEPT noexcept
#define _GLIBCXX_USE_NOEXCEPT noexcept
#define _GLIBCXX_CONSTEXPR constexpr
#define _GLIBCXX_USE_CONSTEXPR constexpr
#define _GLIBCXX14_CONSTEXPR constexpr
#define _GLIBCXX17_CONSTEXPR constexpr
#define _GLIBCXX20_CONSTEXPR constexpr
#define _GLIBCXX_NODISCARD [[nodiscard]]
#define _GLIBCXX_DEPRECATED
#define _GLIBCXX_DEPRECATED_SUGGEST(x)
#define __glibcxx_assert(x)
#define _GLIBCXX_DEBUG_ONLY(x)
#define __try try
#define __catch(x) catch(x)
#define __throw_exception_again throw
#define __N(msgid) (msgid)
#include <cstdlib>
#define _GLIBCXX_THROW_OR_ABORT(e) (std::abort())
#define _GLIBCXX_DEBUG_ASSERT(x)
#define _GLIBCXX_DEBUG_PEDASSERT(x)
