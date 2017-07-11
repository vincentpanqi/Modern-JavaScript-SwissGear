// @flow
import { innerEntityObject } from "../internal/singleton";
import { validate } from "../../lib/declarative-validator/src/core/validator";
import { innerPrimitiveTypes, isPrimitive } from "./type";
const debug = require("debug")("factory");

/**
 * Description 从实体类中生成对象，并且进行数据校验；注意，这里会进行递归生成，即对实体类对象同样进行生成
 * @param EntityClass 实体类
 * @param data 数据对象
 * @param ignore 是否忽略校验
 * @param strict 是否忽略非预定义类属性
 * @throws 当校验失败，会抛出异常
 */
export function instantiate(
  EntityClass: Function,
  data: {
    [string]: any
  },
  { ignore = false, strict = true }: { ignore: boolean, strict: boolean } = {}
): Object {
  const innerObject = innerEntityObject[EntityClass.name];

  debug(innerObject);

  const innerObjectProperties = innerObject.properties;

  let validation = {
    isPass: true
  };

  // 判断是否需要忽略，不忽略则进行校验
  if (!ignore) {
    validation = validate(data, extractRulesFromClass(EntityClass));
  }

  if (!validation.isPass) {
    // 如果校验失败，则抛出异常
    let error = new Error("validate fail!");

    error.validation = validation;

    debug(validation);

    throw error;
  } else {
    // 这里将数据作为初始化参数传入，以保证部分实体类实现时会传入数据
    let instance = new EntityClass(data);

    // 遍历数据进行内部属性初始化
    for (let property in data) {
      // 首先判断该属性是否在预定义的属性内
      if (!innerObjectProperties.hasOwnProperty(property)) {
        if (strict) {
          // 严格模式下忽略该数据
          continue;
        } else {
          // 否则直接当做新数据挂载上去
          instance[property] = data[property];
          continue;
        }
      }

      let type = innerObjectProperties[property].type;

      // 判断是否为原始类型

      if (isPrimitive(type)) {
        try {
          instance[property] = data[property];
        } catch (e) {
          Object.defineProperties(instance, {
            [property]: {
              writable: true,
              enumerable: true,
              value: data[property]
            }
          });
        }
      } else {
        // 判断是否为数组
        if (type === "array" || Array.isArray(type)) {
          // 如果为数组则返回数组
          instance[property] = data[property].map(data => {
            return instantiate(type[0], data[property], {
              ignore,
              strict
            });
          });
        } else {
          instance[property] = instantiate(type, data[property], {
            ignore,
            strict
          });
        }
      }
    }

    return instance;
  }
}

/**
 * Description 从
 * @param EntityClass
 */
export function extractRulesFromClass(EntityClass) {
  const innerObject = innerEntityObject[EntityClass.name];

  const rules = {};

  for (let propertyName of Object.keys(innerObject.properties)) {
    let rule = undefined;

    let property = innerObject.properties[propertyName];

    const requiredCondition =
      innerObject.required && innerObject.required.includes(propertyName);

    // 首先判断是否存在 pattern，如果存在则提取
    if (property.pattern) {
      rule = property.pattern;

      if (requiredCondition) {
        rule = `required|${rule}`;
      }
    } else {
      // 判断是否为必须值
      if (requiredCondition) {
        rule = "required";
      }
    }

    // 仅当规则不为空，才加进来
    rule && (rules[propertyName] = rule);
  }

  return rules;
}
