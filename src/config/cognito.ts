import { CognitoUserPool } from "amazon-cognito-identity-js";

const cognitoConfig = {
  region: "us-east-2",
  userPoolId: "us-east-2_IJ1C0mWXW",
  clientId: "1lntksiqrqhmjea6obrrrrnmh1",
};

export const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.userPoolId,
  ClientId: cognitoConfig.clientId,
});

export default cognitoConfig;
