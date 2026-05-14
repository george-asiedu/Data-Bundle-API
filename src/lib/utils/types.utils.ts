export type MessageOnly = { message: string };
export type DataMessage<T> = {
  message: string;
  data: T;
};
