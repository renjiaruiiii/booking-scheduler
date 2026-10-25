import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";

export default function BackToDashboard() {
  const navigate = useNavigate();

  return (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/auth")}>
      返回工作台
    </Button>
  );
}
