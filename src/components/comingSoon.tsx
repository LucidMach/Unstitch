import { Card, CardContent } from "./ui/card";

const ComingSoon: React.FC = () => {
  return (
    <Card className="px-12">
      <CardContent className="flex flex-col items-center justify-end px-6">
        <h1 className="text-gray-700">want to explore your own ideas</h1>
        <h2 className="text-gray-400">
          this is a place to build your own designs
        </h2>
        <br />
        <input
          type="text"
          className="border-b placeholder-text-center text-center w-full"
          placeholder="enter your email to get notified"
        />
      </CardContent>
    </Card>
  );
};

export default ComingSoon;
