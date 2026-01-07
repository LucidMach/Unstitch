import { Card, CardContent } from "./ui/card";

const ComingSoon: React.FC = () => {
  return (
    <Card className="px-12">
      <CardContent className="flex flex-col items-center justify-end px-6">
        <h1 className="text-gray-700">coming soon</h1>
      </CardContent>
    </Card>
  );
};

export default ComingSoon;
