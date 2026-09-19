/**
 * The bundled demo document: an event-registration form exercising nested
 * objects, arrays, enums and a spread of constraints. Seeded on first boot
 * so the tool is immediately explorable.
 */
export const SAMPLE_SCHEMA_TEXT = `{
  "type": "object",
  "title": "活动报名表",
  "description": "示范 Schema：嵌套对象、数组、枚举与常见约束",
  "properties": {
    "name": {
      "type": "string",
      "title": "姓名",
      "minLength": 2,
      "maxLength": 20
    },
    "email": {
      "type": "string",
      "title": "邮箱",
      "pattern": "^[^@\\\\s]+@[^@\\\\s]+\\\\.[^@\\\\s]+$"
    },
    "age": {
      "type": "integer",
      "title": "年龄",
      "minimum": 18,
      "maximum": 120
    },
    "ticketType": {
      "type": "string",
      "title": "票种",
      "enum": ["standard", "vip", "student"],
      "default": "standard"
    },
    "subscribe": {
      "type": "boolean",
      "title": "订阅活动通知",
      "default": false
    },
    "address": {
      "type": "object",
      "title": "联系地址",
      "properties": {
        "city": {
          "type": "string",
          "title": "城市"
        },
        "zip": {
          "type": "string",
          "title": "邮编",
          "pattern": "^\\\\d{6}$"
        }
      },
      "required": ["city"]
    },
    "companions": {
      "type": "array",
      "title": "同行人",
      "minItems": 0,
      "maxItems": 3,
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "title": "姓名",
            "minLength": 2
          },
          "relation": {
            "type": "string",
            "title": "关系",
            "enum": ["家人", "朋友", "同事"]
          }
        },
        "required": ["name"]
      }
    },
    "tags": {
      "type": "array",
      "title": "兴趣标签",
      "maxItems": 5,
      "items": {
        "type": "string",
        "minLength": 1
      }
    }
  },
  "required": ["name", "email", "ticketType"]
}
`;

export const SAMPLE_DOCUMENT_NAME = '示例：活动报名表';
