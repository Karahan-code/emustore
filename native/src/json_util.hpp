#pragma once

#include <cctype>
#include <cstdint>
#include <cstdio>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

inline std::string json_escape(std::string_view input) {
  std::string out;
  out.reserve(input.size() + 8);
  for (unsigned char ch : input) {
    switch (ch) {
      case '\\': out += "\\\\"; break;
      case '"':  out += "\\\""; break;
      case '\b': out += "\\b";  break;
      case '\f': out += "\\f";  break;
      case '\n': out += "\\n";  break;
      case '\r': out += "\\r";  break;
      case '\t': out += "\\t";  break;
      default:
        if (ch < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", ch);
          out += buf;
        } else {
          out.push_back(static_cast<char>(ch));
        }
        break;
    }
  }
  return out;
}

inline std::string json_string(std::string_view value) {
  return "\"" + json_escape(value) + "\"";
}

namespace detail {

inline size_t find_json_value_start(std::string_view body, std::string_view key) {
  std::string needle = "\"" + std::string(key) + "\"";
  size_t pos = 0;
  while (pos < body.size()) {
    size_t found = body.find(needle, pos);
    if (found == std::string_view::npos) return std::string_view::npos;

    size_t cursor = found + needle.size();
    while (cursor < body.size() && std::isspace(static_cast<unsigned char>(body[cursor]))) {
      cursor += 1;
    }
    if (cursor < body.size() && body[cursor] == ':') {
      cursor += 1;
      while (cursor < body.size() && std::isspace(static_cast<unsigned char>(body[cursor]))) {
        cursor += 1;
      }
      return cursor;
    }
    pos = found + needle.size();
  }
  return std::string_view::npos;
}

}  // namespace detail

inline std::optional<std::string> json_get_string(std::string_view body, std::string_view key) {
  size_t start = detail::find_json_value_start(body, key);
  if (start == std::string_view::npos || start >= body.size() || body[start] != '"') {
    return std::nullopt;
  }

  std::string value;
  size_t cursor = start + 1;
  while (cursor < body.size()) {
    char ch = body[cursor++];
    if (ch == '"') return value;
    if (ch == '\\' && cursor < body.size()) {
      char esc = body[cursor++];
      switch (esc) {
        case '"': value.push_back('"'); break;
        case '\\': value.push_back('\\'); break;
        case '/': value.push_back('/'); break;
        case 'b': value.push_back('\b'); break;
        case 'f': value.push_back('\f'); break;
        case 'n': value.push_back('\n'); break;
        case 'r': value.push_back('\r'); break;
        case 't': value.push_back('\t'); break;
        default: value.push_back(esc); break;
      }
    } else {
      value.push_back(ch);
    }
  }
  return std::nullopt;
}

inline std::optional<bool> json_get_bool(std::string_view body, std::string_view key) {
  size_t start = detail::find_json_value_start(body, key);
  if (start == std::string_view::npos || start >= body.size()) return std::nullopt;
  if (body.substr(start, 4) == "true") return true;
  if (body.substr(start, 5) == "false") return false;
  return std::nullopt;
}

inline std::optional<int64_t> json_get_int64(std::string_view body, std::string_view key) {
  size_t start = detail::find_json_value_start(body, key);
  if (start == std::string_view::npos || start >= body.size()) return std::nullopt;

  size_t end = start;
  if (body[end] == '-') end += 1;
  while (end < body.size() && std::isdigit(static_cast<unsigned char>(body[end]))) {
    end += 1;
  }
  if (end == start || (end == start + 1 && body[start] == '-')) return std::nullopt;

  try {
    return std::stoll(std::string(body.substr(start, end - start)));
  } catch (...) {
    return std::nullopt;
  }
}

inline std::optional<std::vector<std::string>> json_get_string_array(
    std::string_view body,
    std::string_view key) {
  size_t cursor = detail::find_json_value_start(body, key);
  if (cursor == std::string_view::npos || cursor >= body.size() || body[cursor] != '[') {
    return std::nullopt;
  }
  cursor += 1;

  auto skip_ws = [&]() {
    while (cursor < body.size() && std::isspace(static_cast<unsigned char>(body[cursor]))) {
      cursor += 1;
    }
  };

  std::vector<std::string> items;
  skip_ws();
  if (cursor < body.size() && body[cursor] == ']') {
    return items;
  }

  while (cursor < body.size()) {
    skip_ws();
    if (cursor >= body.size() || body[cursor] != '"') {
      return std::nullopt;
    }
    cursor += 1;

    std::string element;
    bool closed = false;
    while (cursor < body.size()) {
      char ch = body[cursor++];
      if (ch == '"') {
        closed = true;
        break;
      }
      if (ch == '\\' && cursor < body.size()) {
        char esc = body[cursor++];
        switch (esc) {
          case '"': element.push_back('"'); break;
          case '\\': element.push_back('\\'); break;
          case '/': element.push_back('/'); break;
          case 'b': element.push_back('\b'); break;
          case 'f': element.push_back('\f'); break;
          case 'n': element.push_back('\n'); break;
          case 'r': element.push_back('\r'); break;
          case 't': element.push_back('\t'); break;
          default: element.push_back(esc); break;
        }
      } else {
        element.push_back(ch);
      }
    }
    if (!closed) return std::nullopt;
    items.push_back(std::move(element));

    skip_ws();
    if (cursor >= body.size()) return std::nullopt;
    if (body[cursor] == ']') return items;
    if (body[cursor] != ',') return std::nullopt;
    cursor += 1;
  }

  return std::nullopt;
}

inline std::string url_decode(std::string_view input, bool plusAsSpace = true) {
  std::string out;
  out.reserve(input.size());
  for (size_t i = 0; i < input.size(); ++i) {
    char ch = input[i];
    if (plusAsSpace && ch == '+') {
      out.push_back(' ');
    } else if (ch == '%' && i + 2 < input.size() &&
               std::isxdigit(static_cast<unsigned char>(input[i + 1])) &&
               std::isxdigit(static_cast<unsigned char>(input[i + 2]))) {
      auto hex = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        return c - 'A' + 10;
      };
      out.push_back(static_cast<char>((hex(input[i + 1]) << 4) | hex(input[i + 2])));
      i += 2;
    } else {
      out.push_back(ch);
    }
  }
  return out;
}

inline std::optional<std::string> parse_query_param(std::string_view query, std::string_view key) {
  size_t pos = 0;
  while (pos <= query.size()) {
    size_t amp = query.find('&', pos);
    std::string_view pair = amp == std::string_view::npos
        ? query.substr(pos)
        : query.substr(pos, amp - pos);

    size_t eq = pair.find('=');
    std::string decodedKey = url_decode(eq == std::string_view::npos ? pair : pair.substr(0, eq), true);
    if (decodedKey == key) {
      if (eq == std::string_view::npos) return std::string{};
      return url_decode(pair.substr(eq + 1), true);
    }

    if (amp == std::string_view::npos) break;
    pos = amp + 1;
  }
  return std::nullopt;
}
