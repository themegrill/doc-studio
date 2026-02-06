import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  onClose: () => void;
}

export default function ChatHeader({ onClose }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
      <div className="flex items-center space-x-2">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">AI Assistant</h3>
      </div>
      <Button
        onClick={onClose}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
