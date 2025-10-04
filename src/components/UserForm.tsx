import React from "react";

interface UserFormProps {
  onClose: () => void;
  editingUser?: any;
}

const UserForm: React.FC<UserFormProps> = ({ onClose, editingUser }) => {
  return (
    <div>
      <h1>Hello World - UserForm</h1>
    </div>
  );
};

export default UserForm;
