import _ from 'lodash';
import { ObjectID, Db } from 'mongodb';
import { isEmpty } from './common';

export type TFieldType = 'any' | 'string' | 'urlCode' | 'number' | 'boolean' | 'id' | ((value: any) => void);

export interface ISchemaField {
  type: TFieldType;
  defaultValue: any;
  required: boolean;
  multiple: boolean;
  unique: boolean;
}

export interface ISchema {
  [fieldName: string]: ISchemaField;
}

export interface IFieldToCheck {
  fieldName: string;
  type: TFieldType;
  value: any;
  required: boolean;
  multiple: boolean;
}

const simpleTypes = {
  any: <T>(value: T): T => value,

  string: <T>(value: T): T => {
    if (typeof value !== 'string')
      throw new Error(`Must be a string.`);
    return value;
  },

  urlCode: <T>(value: T): T => {
    if (!(typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)))
      throw new Error(`Must contain only lower case letters, digits and "-".`);
    return value;
  },

  number: <T>(value: T): T => {
    if (typeof value !== 'number')
      throw new Error(`Must be a number.`);
    return value;
  },

  boolean: <T>(value: T): T => {
    if (typeof value !== 'boolean')
      throw new Error(`Must be a boolean.`);
    return value;
  },

  id: <T>(value: T): T => {
    if (
      !(value instanceof ObjectID) &&
      !(typeof value === 'string' && [12, 24].includes(value.length)) // replace to regex
    )
      throw new Error(`Must be an ObjectID.`);
    return value;
  },
  // email
};

export const checkFieldType: (arg: IFieldToCheck) => Promise<any> = async ({
  type,
  fieldName,
  value,
  required,
  multiple
}) => {
  let error = '';

  if (!required && value === undefined) return;
  value = multiple ? value : [value];

  for (let i = 0; i < value.length; i++) {
    if (typeof type === 'string' && Object.keys(simpleTypes).includes(type))
      try {
        value[i] = await simpleTypes[type](value[i]);
      } catch (err) {
        error = `Invalid type of field "${fieldName}". ${err.message}`;
      }
    else if (typeof type === 'function')
      try {
        value[i] = await type(value[i]);
      } catch (err) {
        error = `Invalid type of field "${fieldName}". ${err.message}`;
      }
    else
      error = `Invalid 'type' property of "${fieldName}" in schema.`;
  }

  if (error) throw new Error(error);

  return multiple ? value : value[0];
};

interface IRelationArgs {
  db: Db,
  collectionName: string;
  checkTargetExists?: boolean;
}

export const relation = ({
  db,
  collectionName,
  checkTargetExists = true // TODO: implement?
}: IRelationArgs) => async (value: any) => {
  try {
    simpleTypes.id(value);
    if (!(value instanceof ObjectID))
      value = new ObjectID(value);

    const r = await db.collection(collectionName)
      .find({ $or: [{ _id: value }] })
      .toArray();

    if (!r.length)
      throw new Error('Target item not exists.');
  } catch (err) {
    throw new Error(err.message);
  }

  return value;
};

type TValueObject = {
  [key: string]: any;
}

type TShape = (model: ISchema) => (valueObject: TValueObject) => Promise<TValueObject>;

export const shape: TShape = model => async (valueObject) => {
  if (typeof valueObject !== 'object') throw new Error('Input value is not a object');

  const modelKeys = Object.keys(model);

  const excessKeys = Object.keys(_.omit(valueObject, modelKeys));
  if (excessKeys.length)
    throw new Error(`Input object has an excess keys: ${excessKeys.join(', ')}.`);

  for (const key in model) {
    if (model[key].required && isEmpty(valueObject[key]))
      throw new Error(`Field "${key}" is required.`);

    await checkFieldType({
      type: model[key].type,
      fieldName: key,
      value: valueObject[key],
      required: model[key].required,
      multiple: model[key].multiple
    });
  }

  return valueObject;
};

export const any = simpleTypes.any;
export const string = simpleTypes.string;
export const urlCode = simpleTypes.urlCode;
export const number = simpleTypes.number;
export const boolean = simpleTypes.boolean;
export const id = simpleTypes.id;