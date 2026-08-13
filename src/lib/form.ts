export const readForm = async (request: Request) => {
  try {
    return await request.formData();
  } catch {
    return null;
  }
};
