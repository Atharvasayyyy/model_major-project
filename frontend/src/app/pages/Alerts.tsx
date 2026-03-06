import { useSensorData } from "../context/SensorDataContext";
import { useChildren } from "../context/ChildrenContext";
import { AlertCircle, CheckCircle, Trash2, Bell } from "lucide-react";

export const Alerts = () => {
  const { alerts, markAlertAsRead, clearAlerts } = useSensorData();
  const { selectedChild } = useChildren();

  const unreadCount = alerts.filter((a) => !a.read).length;

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "stress":
      case "high_stress":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "low_engagement":
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case "high_hr":
      case "abnormal_heart_rate":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertColor = (type: string, read: boolean) => {
    if (read) return "bg-secondary/50 border-border";
    
    switch (type) {
      case "stress":
      case "high_stress":
        return "bg-red-500/10 border-red-500/50";
      case "low_engagement":
        return "bg-orange-500/10 border-orange-500/50";
      case "high_hr":
      case "abnormal_heart_rate":
        return "bg-yellow-500/10 border-yellow-500/50";
      default:
        return "bg-gray-500/10 border-gray-500/50";
    }
  };

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            No child profile selected. Please select or add a child first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Alerts</h1>
          <p className="text-muted-foreground">
            Notifications for {selectedChild.child_name}
          </p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            Clear All
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-6 h-6 text-purple-500" />
            <p className="text-sm text-muted-foreground">Total Alerts</p>
          </div>
          <p className="text-3xl font-bold">{alerts.length}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-6 h-6 text-orange-500" />
            <p className="text-sm text-muted-foreground">Unread</p>
          </div>
          <p className="text-3xl font-bold">{unreadCount}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <p className="text-sm text-muted-foreground">Read</p>
          </div>
          <p className="text-3xl font-bold">{alerts.length - unreadCount}</p>
        </div>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-xl font-semibold mb-2">All Clear!</p>
          <p className="text-muted-foreground">No alerts at the moment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 transition-all ${getAlertColor(
                alert.type,
                alert.read
              )}`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">{getAlertIcon(alert.type)}</div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="font-semibold">{alert.message}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!alert.read && (
                      <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                        New
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {!alert.read && (
                      <button
                        onClick={() => markAlertAsRead(alert.id)}
                        className="text-sm bg-secondary hover:bg-accent text-foreground px-3 py-1.5 rounded-md transition-colors"
                      >
                        Mark as Read
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Type: {alert.type.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alert Types Legend */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Alert Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold text-red-500">High Stress</p>
              <p className="text-sm text-muted-foreground">
                Engagement score below 0.2 detected
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-500">Low Engagement</p>
              <p className="text-sm text-muted-foreground">
                Engagement score between 0.2-0.4
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-500">High Heart Rate</p>
              <p className="text-sm text-muted-foreground">
                Heart rate significantly above baseline
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
