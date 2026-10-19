# Instructions

Your team is working on a meteorology application.
They have defined an API with various types and constants representing meteorological data, see file `meteorology.go`.

Your task is to add suitable `String` methods to all types so that they implement interface `Stringer`.

## 1. Implement the `Stringer` interface for type `TemperatureUnit`

After some discussion, the team have agreed that the unit of temperature will be either `Celsius` or `Fahrenheit`.
Values should be formatted as shown in the examples below.

Make the `TemperatureUnit` type implement the `Stringer` interface by adding a `String` method to it.
This method must return the string `"°C"` if the temperature unit is Celsius or `"°F"` if the temperature unit is Fahrenheit.

```go
celsiusUnit := Celsius
fahrenheitUnit := Fahrenheit

celsiusUnit.String()
// => °C
fahrenheitUnit.String()
// => °F
fmt.Sprint(celsiusUnit)
// Output: °C
```

## 2. Implement the `Stringer` interface for type `Temperature`

Temperature values consist of an integer and a temperature unit.
They should be formatted as in the examples below.

For that to happen, make the `Temperature` type implement the `Stringer` interface by adding a `String` method to it.
This method should return a string with the numeric value for the temperature and the temperature unit separated by a space: `<temperature> <unit>`:

```go
celsiusTemp := Temperature{
    degree: 21,
    unit: Celsius,
}
celsiusTemp.String()
// => 21 °C
fmt.Sprint(celsiusTemp)
// Output: 21 °C

fahrenheitTemp := Temperature{
    degree: 75,
    unit: Fahrenheit,
}
fahrenheitTemp.String()
// => 75 °F
fmt.Sprint(fahrenheitTemp)
// Output: 75 °F
```

## 3. Implement the `Stringer` interface for type `SpeedUnit`

After lengthy discussions, the team has agreed that the unit of wind speed will be either `KmPerHour` or `MilesPerHour`.
Values should be formatted as the examples below.

For that to happen, make the `SpeedUnit` type implement the `Stringer` interface by adding a `String` method to it.
This method must return the string `"km/h"` if the speed unit is kilometers per hour or `"mph"` if the speed unit is miles per hour:

```go
mphUnit := MilesPerHour
mphUnit.String()
// => mph
fmt.Sprint(mphUnit)
// Output: mph

kmhUnit := KmPerHour
kmhUnit.String()
// => km/h
fmt.Sprint(kmhUnit)
// Output: km/h
```

## 4. Implement the `Stringer` interface for `Speed`

Wind speed values consist of an integer and a speed unit.
They should be formatted as in the example below.

For that to happen, make the `Speed` type implement the `Stringer` interface by adding a `String` method to it.
This method should return a string with the numeric value for the speed and the speed unit separated by a space: `<speed> <unit>`:

```go
windSpeedNow := Speed{
    magnitude: 18,
    unit: KmPerHour,
}
windSpeedNow.String()
// => 18 km/h
fmt.Sprintf(windSpeedNow)
// Output: 18 km/h

windSpeedYesterday := Speed{
    magnitude: 22,
    unit: MilesPerHour,
}
windSpeedYesterday.String()
// => 22 mph
fmt.Sprint(windSpeedYesterday)
// Output: 22 mph
```

## 5. Implement the `Stringer` interface for type `MeteorologyData`

Meteorological data specifies location, temperature, wind direction, wind speed and humidity.
It should be formatted as in the example below:

For that to happen, make the `MeteorologyData` type implement the `Stringer` interface by adding a `String` method to it.
This method should return the meteorology data in the following format:

```text
<location>: <temperature>, Wind <wind_direction> at <wind_speed>, <humidity>% Humidity
```

```go
sfData := MeteorologyData{
    location: "San Francisco",
    temperature: Temperature{
        degree: 57,
        unit: Fahrenheit
    },
    windDirection: "NW",
    windSpeed: Speed{
        magnitude: 19,
        unit: MilesPerHour
    },
    humidity: 60
}

sfData.String()
// => San Francisco: 57 °F, Wind NW at 19 mph, 60% Humidity
fmt.Sprint(sfData)
// Output: San Francisco: 57 °F, Wind NW at 19 mph, 60% Humidity
```

## Hints

## 1. Implement the `Stringer` interface for type `TemperatureUnit`

- The type `TemperatureUnit` is already created for you and represents a temperature unit
- Note that there are already 2 constants created for you that are of this type: `Celsius` and `Fahrenheit`, representing a temperature in Celsius and Fahrenheit, respectively
- Add a `String()` method to the `TemperatureUnit` type so it satisfies the `Stringer` interface.
  This method must return the string `"°C"` if the temperature unit is Celsius or `"°F"` if the temperature unit is Fahrenheit

## 2. Implement the `Stringer` interface for type  `Temperature`

- Add a `String()` method to the `Temperature` type so it satisfies the `Stringer` interface
- The `String()` method should return a string with the numeric value for the temperature and the temperature unit separated by a space (`<temperature> <unit>`)
- The `Temperature` struct contains a `TemperatureUnit` and a `int`.
  You can use [fmt.Sprintf][sprintf] to help you format this string
- Since `TemperatureUnit` already implements the `Stringer` interface (from task 1), the functions of the `fmt` package like [fmt.Sprintf][sprintf] will know how to format it when you use the `%v` or `%s` [formatting verbs][fmt]

## 3. Implement the `Stringer` interface for type `SpeedUnit`

- The type `SpeedUnit` is already created for you and represents a temperature unit
- Note that there are already 2 constants created for you that are of this type: `KmPerHour` and `MilesPerHour`, representing a speed in kilometers per hour and miles per hour, respectively
- Add a `String()` method to the `SpeedUnit` type so it satisfies the `Stringer` interface.
  This method must return the string `"km/h"` if the speed unit is kilometers per hour or `"mph"` if the speed unit is miles per hour.

## 4. Implement the `Stringer` interface for `Speed`

- Add a `String()` method to the `Speed` type so it satisfies the `Stringer` interface
- The `String()` method should return a string with the numeric value for the speed and the speed unit separated by a space (`<speed> <unit>`)
- The `Speed` contains a `SpeedUnit` and a `int`.
  You can use [fmt.Sprintf][sprintf] to help you format this string
- Since `TemperatureUnit` struct already implements the `Stringer` interface (from task 3), the functions of the `fmt` package like [fmt.Sprintf][sprintf] will know how to format it when you use the `%v` or `%s` [formatting verbs][fmt]
- To insert a `%` in the final string when using [fmt.Sprintf][sprintf], use `%%` in the formatting string.

## 5. Implement the `Stringer` interface for type `MeteorologyData`

- The `Speed` contains a `Temperature` and a `Speed` fields, among other fields.
  You can use [fmt.Sprintf][sprintf] to help you format this string
- The `String` method should return the meteorology data in the following format: `"<location>: <temperature>, Wind <wind_direction> at <wind_speed>, <humidity>% Humidity"`
- Since the `Temperature` and `Speed` types already implement the `Stringer` interface (from task 2 and 4), the functions of the `fmt` package like [fmt.Sprintf][sprintf] will know how to format it when you use the `%v` or `%s` [formatting verbs][fmt]

[fmt]: https://pkg.go.dev/fmt
[sprintf]: https://pkg.go.dev/fmt#Sprintf
