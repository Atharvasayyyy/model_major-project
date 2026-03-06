import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface EngagementGaugeProps {
  value: number; // 0 to 1
}

export const EngagementGauge = ({ value }: EngagementGaugeProps) => {
  const percentage = Math.round(value * 100);
  
  const data = [
    { value: percentage },
    { value: 100 - percentage },
  ];

  const getColor = (val: number) => {
    if (val >= 0.8) return "#22c55e"; // green
    if (val >= 0.6) return "#3b82f6"; // blue
    if (val >= 0.4) return "#eab308"; // yellow
    if (val >= 0.2) return "#f97316"; // orange
    return "#ef4444"; // red
  };

  const getLabel = (val: number) => {
    if (val >= 0.8) return "Highly Engaged";
    if (val >= 0.6) return "Engaged";
    if (val >= 0.4) return "Neutral";
    if (val >= 0.2) return "Low Engagement";
    return "Stress";
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            dataKey="value"
          >
            <Cell fill={getColor(value)} />
            <Cell fill="#2d2d2d" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center -mt-8">
        <p className="text-4xl font-bold" style={{ color: getColor(value) }}>
          {percentage}%
        </p>
        <p className="text-muted-foreground mt-2">{getLabel(value)}</p>
      </div>
    </div>
  );
};
