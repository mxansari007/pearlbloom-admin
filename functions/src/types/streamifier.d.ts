declare module "streamifier" {
  const streamifier: {
    createReadStream(buffer: Buffer): NodeJS.ReadableStream;
  };
  export default streamifier;
}
